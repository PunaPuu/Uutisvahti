import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, merge, newAlerts, toItems } from '../src/build.mjs'
import { buildMessage, sendAlerts } from '../src/notify.mjs'
import { FEEDS } from '../src/feeds.mjs'

const NOW = '2026-11-27T10:00:00.000Z'
const quiet = { log() {}, warn() {} }
const TOPIC = 'uv-test-' + 'x'.repeat(16) // built at runtime, made up
const SITE = 'https://site.example.test/Uutisvahti'

// A fake network: feeds come from fixtures, the previous site and ntfy are scripted.
function fakeFetch({ previous, ntfyStatus = 200, failFeed } = {}) {
  const calls = { ntfy: [] }
  const impl = async (url, opts = {}) => {
    if (url === SITE + '/items.json') {
      if (previous === undefined) return new Response('nope', { status: 404 })
      if (previous === 'error') return new Response('boom', { status: 500 })
      return Response.json({ items: previous })
    }
    if (url.startsWith('https://ntfy.example.test')) {
      calls.ntfy.push(JSON.parse(opts.body))
      return new Response('', { status: ntfyStatus })
    }
    const f = FEEDS.find((x) => x.url === url)
    if (!f) throw new Error('unexpected url ' + url)
    if (f.id === failFeed) return new Response('', { status: 503 })
    return new Response(readFileSync(new URL(`./fixtures/${f.fixture}`, import.meta.url)))
  }
  return { impl, calls }
}

function run(opts) {
  const dir = mkdtempSync(join(tmpdir(), 'uv-'))
  const env = { UV_SITE_URL: SITE, NTFY_TOPIC: TOPIC, NTFY_SERVER: 'https://ntfy.example.test' }
  return build({ out: dir, env, log: quiet, now: NOW, ...opts }).then((r) => {
    const json = JSON.parse(readFileSync(join(dir, 'items.json'), 'utf8'))
    rmSync(dir, { recursive: true, force: true })
    return { ...r, json }
  })
}

test('toItems drops non-https links and items without titles', () => {
  const feed = FEEDS[0]
  const rules = { include: [], exclude: [], alerts: { statuses: [], products: [], keywords: [] } }
  const items = toItems([
    { title: 'ok', link: 'https://example.test/a', categories: [], summary: '' },
    { title: 'js', link: 'javascript:alert(1)', categories: [], summary: '' },
    { title: 'http', link: 'http://example.test/b', categories: [], summary: '' },
    { title: '', link: 'https://example.test/c', categories: [], summary: '' },
  ], feed, rules)
  assert.deepEqual(items.map((i) => i.title), ['ok'])
})

test('merge keeps first-seen time, keeps rotated-out items, prunes old ones', () => {
  const prev = [
    { id: 'a', title: 'A', link: 'https://example.test/a', date: '2026-11-20T00:00:00Z', seen: '2026-11-20T01:00:00Z' },
    { id: 'old', title: 'Old', link: 'https://example.test/old', date: '2026-01-01T00:00:00Z', seen: '2026-01-01T00:00:00Z' },
    { id: 'gone', title: 'Rotated out', link: 'https://example.test/gone', date: '2026-11-19T00:00:00Z', seen: '2026-11-19T00:00:00Z' },
  ]
  const fresh = [
    { id: 'a', title: 'A', link: 'https://example.test/a', date: '2026-11-20T00:00:00Z' },
    { id: 'b', title: 'B', link: 'https://example.test/b', date: '2026-11-26T00:00:00Z' },
  ]
  const out = merge(fresh, prev, { now: NOW, keepDays: 90 })
  assert.deepEqual(out.map((i) => i.id), ['b', 'a', 'gone'])
  assert.equal(out.find((i) => i.id === 'a').seen, '2026-11-20T01:00:00Z')
  assert.equal(out.find((i) => i.id === 'b').seen, NOW)
})

test('newAlerts: never on first run, only unseen matching items after', () => {
  const rules = { alerts: { statuses: ['Retiring'], products: [], keywords: [] } }
  const items = [{ id: '1', status: 'Retiring', title: '', summary: '' }, { id: '2', status: 'Retiring', title: '', summary: '' }, { id: '3', status: 'GA', title: '', summary: '' }]
  assert.deepEqual(newAlerts(items, null, rules), [])
  assert.deepEqual(newAlerts(items, [{ id: '1' }], rules).map((i) => i.id), ['2'])
})

test('build, first run: publishes everything and sends no push', async () => {
  const { impl, calls } = fakeFetch()
  const r = await run({ fetchImpl: impl })
  assert.ok(r.json.items.length >= 10)
  assert.equal(r.json.generated, NOW)
  assert.ok(r.json.sources.every((s) => s.ok))
  assert.equal(calls.ntfy.length, 0)
  assert.equal(r.push.reason, 'no alerts')
})

test('build, later run: one batched push for new alert items only', async () => {
  const first = await run({ fetchImpl: fakeFetch().impl })
  // Pretend the Retiring items are new: drop them from "previous".
  const previous = first.json.items.filter((i) => i.status !== 'Retiring')
  const { impl, calls } = fakeFetch({ previous })
  const r = await run({ fetchImpl: impl })
  const expected = first.json.items.filter((i) => i.status === 'Retiring')
  assert.ok(expected.length >= 2)
  assert.equal(calls.ntfy.length, 1)
  assert.equal(calls.ntfy[0].topic, TOPIC)
  assert.equal(calls.ntfy[0].title, `Uutisvahti: ${expected.length} new alerts`)
  assert.equal(calls.ntfy[0].priority, 4)
  assert.equal(calls.ntfy[0].click, SITE)
  assert.equal(r.alerts.length, expected.length)

  // Running again with the same previous state finds nothing new.
  const again = fakeFetch({ previous: r.json.items })
  await run({ fetchImpl: again.impl })
  assert.equal(again.calls.ntfy.length, 0)
})

test('build: a failed feed keeps its earlier items and is reported', async () => {
  const first = await run({ fetchImpl: fakeFetch().impl })
  const { impl } = fakeFetch({ previous: first.json.items, failFeed: 'azure-updates' })
  const r = await run({ fetchImpl: impl })
  const src = r.json.sources.find((s) => s.id === 'azure-updates')
  assert.equal(src.ok, false)
  assert.match(src.error, /503/)
  assert.ok(r.json.items.some((i) => i.source === 'azure-updates'))
})

test('build: unreadable previous site stops the build (no lost history)', async () => {
  await assert.rejects(run({ fetchImpl: fakeFetch({ previous: 'error' }).impl }), /HTTP 500/)
})

test('build: a failed push does not fail the build', async () => {
  const first = await run({ fetchImpl: fakeFetch().impl })
  const previous = first.json.items.filter((i) => i.status !== 'Retiring')
  const r = await run({ fetchImpl: fakeFetch({ previous, ntfyStatus: 500 }).impl })
  assert.equal(r.push.sent, false)
  assert.match(r.push.reason, /500/)
})

test('notify: message shape, single item links to the story', () => {
  const one = buildMessage([{ status: 'GA', product: 'Azure', title: 'T', link: 'https://example.test/t' }], SITE)
  assert.equal(one.click, 'https://example.test/t')
  assert.equal(one.priority, 3)
  const many = buildMessage(Array.from({ length: 9 }, (_, i) => ({ status: 'Preview', product: 'Azure', title: 'T' + i })), SITE)
  assert.equal(many.message.split('\n').length, 7)
  assert.match(many.message, /and 3 more$/)
})

test('notify: refuses bad topics and non-https servers without sending', async () => {
  let sent = 0
  const f = async () => { sent++; return new Response('') }
  const a = [{ status: 'GA', product: 'Azure', title: 'T' }]
  assert.match((await sendAlerts(a, { topic: '', fetchImpl: f })).reason, /not set/)
  assert.match((await sendAlerts(a, { topic: 'short', fetchImpl: f })).reason, /16-64/)
  assert.match((await sendAlerts(a, { topic: TOPIC, server: 'http://ntfy.example.test', fetchImpl: f })).reason, /https/)
  assert.equal(sent, 0)
})

test('cleanPrevious drops malformed items and re-checks every field', async () => {
  const { cleanPrevious } = await import('../src/build.mjs')
  const good = { id: 'whatever', title: 'T', link: 'https://example.test/t', date: '2026-11-20T00:00:00Z', seen: '2026-11-20T00:00:00Z', source: 'azure-updates', product: 'Azure', status: 'GA', summary: 's', categories: ['a', 5] }
  const out = cleanPrevious([
    good,
    { ...good, link: 'javascript:alert(1)' },
    { ...good, link: 'http://example.test/x' },
    { ...good, seen: 12345 },
    { ...good, source: 'evil' },
    { ...good, title: '' },
    null, 'str',
    { ...good, link: 'https://example.test/u', product: 'Hacked', status: 'Pwned', date: { x: 1 } },
  ])
  assert.equal(out.length, 2)
  assert.notEqual(out[0].id, 'whatever')
  assert.deepEqual(out[0].categories, ['a'])
  assert.equal(out[1].product, 'Other')
  assert.equal(out[1].status, 'Announcement')
  assert.equal(out[1].date, null)
  assert.equal(cleanPrevious({ not: 'array' }), null)
})

test('merge: future dates fall back to first-seen; non-string dates do not crash', () => {
  const out = merge([], [
    { id: 'f', title: 'Future', link: 'https://example.test/f', date: '2099-01-01T00:00:00Z', seen: '2026-11-26T00:00:00Z' },
    { id: 'n', title: 'Now', link: 'https://example.test/n', date: '2026-11-27T09:00:00Z', seen: '2026-11-27T09:00:00Z' },
  ], { now: NOW, keepDays: 90 })
  assert.deepEqual(out.map((i) => i.id), ['n', 'f'])
  assert.equal(out[1].date, null)
})

test('readLimited refuses oversized responses', async () => {
  const { readLimited } = await import('../src/feeds.mjs')
  assert.equal(await readLimited(new Response('hello'), 10), 'hello')
  await assert.rejects(readLimited(new Response('x'.repeat(50)), 10), /too large/)
  await assert.rejects(readLimited(new Response('x', { headers: { 'content-length': '999' } }), 10), /too large/)
})
