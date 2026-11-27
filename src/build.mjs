// Build the site: fetch every enabled feed, normalize, classify, filter, merge
// with the previously published items, write <out>/items.json, copy public/,
// and push alerts for new items.
//
//   node src/build.mjs [--offline] [--out site]
//
// Environment (all optional):
//   UV_SITE_URL   published site, e.g. https://<user>.github.io/Uutisvahti
//                 (previous items.json is read from here to find new items)
//   NTFY_TOPIC    ntfy topic for alerts (secret)
//   NTFY_SERVER   ntfy server, default https://ntfy.sh

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { FEEDS, MAX_BYTES, fetchFeed, readLimited } from './feeds.mjs'
import { parseFeed } from './parse.mjs'
import { PRODUCTS, STATUSES, classifyProduct, classifyStatus } from './classify.mjs'
import { dedupe, itemId } from './dedupe.mjs'
import { feedEnabled, isAlert, keep, loadRules } from './rules.mjs'
import { sendAlerts } from './notify.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_CATEGORIES = 8
const MAX_TEXT = 500
const DAY = 86_400_000

function safeLink(link) {
  try {
    const u = new URL(link)
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Raw parsed entries of one feed -> NewsItems that pass the rules. */
export function toItems(entries, feed, rules) {
  const out = []
  for (const e of entries) {
    const link = safeLink(e.link)
    if (!link || !e.title) continue
    const base = { title: e.title, summary: e.summary, categories: e.categories.slice(0, MAX_CATEGORIES) }
    if (!keep(base, rules, feed)) continue
    out.push({
      id: itemId(link),
      title: e.title,
      link,
      date: e.date,
      source: feed.id,
      product: classifyProduct(e, feed),
      status: classifyStatus(e, feed.id),
      summary: e.summary,
      categories: base.categories,
    })
  }
  return out
}

const isoOrNull = (v) => {
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
const FEED_IDS = new Set(FEEDS.map((f) => f.id))

/**
 * Items read back from the previously published items.json are untrusted:
 * keep only well-formed ones, with every field re-checked, and the id
 * recomputed from the (https-only) link.
 */
export function cleanPrevious(items) {
  if (!Array.isArray(items)) return null
  const out = []
  for (const i of items) {
    if (!i || typeof i !== 'object') continue
    const link = safeLink(i.link)
    const title = text(i.title, MAX_TEXT).trim()
    const seen = isoOrNull(i.seen)
    if (!link || !title || !seen || !FEED_IDS.has(i.source)) continue
    out.push({
      id: itemId(link),
      title,
      link,
      date: isoOrNull(i.date),
      source: i.source,
      product: PRODUCTS.includes(i.product) ? i.product : 'Other',
      status: STATUSES.includes(i.status) ? i.status : 'Announcement',
      summary: text(i.summary, MAX_TEXT),
      categories: Array.isArray(i.categories) ? i.categories.filter((c) => typeof c === 'string').slice(0, MAX_CATEGORIES).map((c) => c.slice(0, 100)) : [],
      seen,
    })
  }
  return out
}

/**
 * Merge fresh items with the previous run's items.
 * - keeps `seen` (first time we saw the item) from the previous run
 * - keeps previous items of feeds that failed this run, and items that rotated
 *   out of a feed, until they are older than keepDays
 */
export function merge(fresh, previous, { now, keepDays }) {
  const prevById = new Map((previous ?? []).map((i) => [i.id, i]))
  const byId = new Map()
  for (const it of fresh) {
    if (byId.has(it.id)) continue
    byId.set(it.id, { ...it, seen: prevById.get(it.id)?.seen ?? now })
  }
  for (const it of previous ?? []) if (!byId.has(it.id)) byId.set(it.id, it)
  const nowMs = new Date(now).getTime()
  const cutoff = nowMs - keepDays * DAY
  const all = [...byId.values()]
    // A date more than a day in the future is wrong; fall back to first-seen so it can't pin itself to the top.
    .map((i) => (i.date && Date.parse(i.date) > nowMs + DAY ? { ...i, date: null } : i))
    .filter((i) => new Date(i.date ?? i.seen).getTime() >= cutoff)
  all.sort((a, b) => String(b.date ?? b.seen).localeCompare(String(a.date ?? a.seen)))
  return dedupe(all)
}

export function newAlerts(items, previous, rules) {
  if (!previous) return [] // first run: never flood
  const known = new Set(previous.map((i) => i.id))
  return items.filter((i) => !known.has(i.id) && isAlert(i, rules))
}

async function loadPrevious(siteUrl, fetchImpl) {
  if (!siteUrl) return null
  const res = await fetchImpl(siteUrl.replace(/\/$/, '') + '/items.json', { signal: AbortSignal.timeout(30_000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`previous items.json: HTTP ${res.status}`)
  const data = JSON.parse(await readLimited(res, MAX_BYTES))
  return cleanPrevious(data?.items)
}

export async function build({ offline = false, out = 'site', env = process.env, fetchImpl = fetch, log = console, now = new Date().toISOString() } = {}) {
  const rules = loadRules(join(ROOT, 'config/rules.json'))
  const siteUrl = offline ? '' : env.UV_SITE_URL ?? ''
  if (siteUrl && !/^https:\/\//.test(siteUrl)) throw new Error('UV_SITE_URL must start with https://')

  // If the previous site can't be read (other than "not there yet"), stop:
  // publishing now would lose history and could re-send old alerts.
  const previous = offline ? null : await loadPrevious(siteUrl, fetchImpl)

  const sources = []
  const fresh = []
  for (const feed of FEEDS) {
    if (!feedEnabled(rules, feed.id)) continue
    try {
      const xml = offline
        ? readFileSync(join(ROOT, 'test/fixtures', feed.fixture), 'utf8')
        : await fetchFeed(feed, { fetchImpl })
      const items = toItems(parseFeed(xml), feed, rules)
      fresh.push(...items)
      sources.push({ id: feed.id, name: feed.name, url: feed.url, ok: true, count: items.length })
    } catch (e) {
      log.warn(`feed ${feed.id} failed: ${e.message}`)
      sources.push({ id: feed.id, name: feed.name, url: feed.url, ok: false, count: 0, error: String(e.message).slice(0, 200) })
    }
  }
  if (!sources.some((s) => s.ok)) throw new Error('every feed failed; not publishing')

  const items = merge(fresh, previous, { now, keepDays: rules.keepDays })
  const alerts = newAlerts(items, previous, rules)

  const outDir = resolve(ROOT, out)
  mkdirSync(outDir, { recursive: true })
  cpSync(join(ROOT, 'public'), outDir, { recursive: true })
  writeFileSync(join(outDir, 'items.json'), JSON.stringify({ generated: now, sources, items }))

  const push = offline ? { sent: false, reason: 'offline' } : await sendAlerts(alerts, { topic: env.NTFY_TOPIC, server: env.NTFY_SERVER || undefined, siteUrl, fetchImpl, log })
  log.log(`Built ${items.length} items from ${sources.filter((s) => s.ok).length}/${sources.length} feeds into ${out}/. New alerts: ${alerts.length}. Push: ${push.sent ? 'sent' : push.reason}.`)
  return { items, sources, alerts, push }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const outIdx = args.indexOf('--out')
  build({ offline: args.includes('--offline'), out: outIdx >= 0 ? args[outIdx + 1] : 'site' }).catch((e) => {
    console.error(`Build failed: ${e.message}`)
    process.exit(1)
  })
}
