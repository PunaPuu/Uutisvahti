import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decodeEntities, htmlToText, parseFeed } from '../src/parse.mjs'
import { classifyProduct, classifyStatus } from '../src/classify.mjs'
import { dedupe, itemId, normalizeLink } from '../src/dedupe.mjs'
import { hasWord, isAlert, keep, loadRules } from '../src/rules.mjs'
import { FEEDS } from '../src/feeds.mjs'

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')
const feed = (id) => FEEDS.find((f) => f.id === id)

test('every feed has a fixture and an https url', () => {
  for (const f of FEEDS) {
    assert.match(f.url, /^https:\/\//, f.id)
    assert.ok(parseFeed(fx(f.fixture)).length > 0, `${f.id} fixture parses`)
  }
})

test('RSS: Azure Updates fields, categories and Z dates', () => {
  const [a, b, c] = parseFeed(fx('azure-updates.xml'))
  assert.equal(a.title, '[In preview] Public Preview: Example routing feature')
  assert.equal(a.link, 'https://azure.microsoft.com/updates?id=900001')
  assert.equal(a.date, '2026-11-25T23:14:20.000Z')
  assert.deepEqual(a.categories, ['In preview', 'Networking', 'Feature'])
  assert.match(a.summary, /public preview & ready/)
  assert.ok(b.categories.includes('Retirements'))
  assert.equal(c.summary, 'Example backup improvement is generally available.')
})

test('RSS: escaped HTML in descriptions becomes plain text', () => {
  const [a] = parseFeed(fx('m365-roadmap.xml'))
  assert.equal(a.summary, 'An example layout for meeting recaps. GA date: March CY2027')
  assert.doesNotMatch(a.summary, /[<>]/)
})

test('Atom: links, terms, html titles', () => {
  const [a, b] = parseFeed(fx('azure-infra-blog.xml'))
  assert.equal(a.title, 'Example: VM sizes & more now available')
  assert.equal(a.link, 'https://techcommunity.microsoft.com/blog/azureinfrastructureblog/example-vm-sizes/3')
  assert.deepEqual(a.categories, ['Virtual Machines'])
  assert.equal(a.date, '2026-11-26T08:00:00.000Z')
  assert.equal(b.link, 'https://azure.microsoft.com/en-us/blog/example-agents-foundry/')
})

test('entities and tags', () => {
  assert.equal(decodeEntities('a &amp; b &#8217; &#x41; &bogus;'), 'a & b ’ A &bogus;')
  assert.equal(htmlToText('<p>Hi<script>alert(1)</script></p><img src=x onerror=y>there'), 'Hi there')
  assert.equal(decodeEntities('&#0;&#x110000;'), '')
})

test('summaries are capped', () => {
  const long = `<rss><channel><item><title>t</title><link>https://example.test/a</link><description>${'word '.repeat(300)}</description></item></channel></rss>`
  const [a] = parseFeed(long)
  assert.ok(a.summary.length <= 400)
  assert.ok(a.summary.endsWith('…'))
})

test('status: feed categories win, then title, then body', () => {
  assert.equal(classifyStatus({ categories: ['In preview'] }), 'Preview')
  assert.equal(classifyStatus({ categories: ['Compute', 'Retirements'] }), 'Retiring')
  assert.equal(classifyStatus({ categories: ['Launched'] }), 'GA')
  // roadmap: phase categories (GA / Preview) are ignored, status category counts
  assert.equal(classifyStatus({ categories: ['In development', 'General Availability', 'Preview'] }, 'm365-roadmap'), 'In development')
  assert.equal(classifyStatus({ categories: ['Rolling out', 'General Availability'] }, 'm365-roadmap'), 'Rolling out')
  assert.equal(classifyStatus({ categories: ['General Availability'] }, 'm365-roadmap'), 'In development')
  assert.equal(classifyStatus({ title: 'Retirement: X ends', summary: 'Y is now available instead' }), 'Retiring')
  assert.equal(classifyStatus({ title: 'X is now generally available' }), 'GA')
  assert.equal(classifyStatus({ title: 'Something', summary: 'this API is deprecated' }), 'Retiring')
  assert.equal(classifyStatus({ title: 'A blog post', summary: 'nothing' }), 'Announcement')
})

test('product: Copilot first, then feed default, then keywords', () => {
  assert.equal(classifyProduct({ title: 'Microsoft 365 Copilot: thing' }, feed('m365-roadmap')), 'Copilot')
  assert.equal(classifyProduct({ title: 'SharePoint: thing' }, feed('m365-roadmap')), 'M365')
  assert.equal(classifyProduct({ title: 'Dynamics 365 Finance: thing' }, feed('m365-roadmap')), 'Other')
  assert.equal(classifyProduct({ title: 'Microsoft Power Platform governance: thing' }, feed('m365-roadmap')), 'Other')
  assert.equal(classifyProduct({ title: 'VM sizes' }, feed('azure-updates')), 'Azure')
  assert.equal(classifyProduct({ title: 'Datacenter news', summary: 'about Azure regions' }, feed('microsoft-blog')), 'Azure')
  assert.equal(classifyProduct({ title: 'Teams tips' }, feed('techcommunity')), 'M365')
  assert.equal(classifyProduct({ title: 'Company news' }, feed('microsoft-blog')), 'Other')
})

test('dedupe by normalized link and by title', () => {
  assert.equal(normalizeLink('https://Azure.Microsoft.com/blog/x/?utm_source=rss#top'), 'https://azure.microsoft.com/blog/x')
  assert.equal(itemId('https://example.test/a?utm_medium=x'), itemId('https://example.test/a'))
  const out = dedupe([
    { title: '[Launched] Thing A', link: 'https://example.test/1' },
    { title: 'Other', link: 'https://example.test/1/?utm_source=x' },
    { title: 'Thing A', link: 'https://example.test/2' },
    { title: 'Thing B', link: 'https://example.test/3' },
  ])
  assert.deepEqual(out.map((o) => o.link), ['https://example.test/1', 'https://example.test/3'])
})

test('rules: repo rules.json is valid; include only for broad feeds; exclude wins', () => {
  const rules = loadRules(new URL('../config/rules.json', import.meta.url))
  assert.ok(rules.include.length > 0)
  const r = { ...rules, include: ['azure'], exclude: ['webinar'] }
  assert.equal(keep({ title: 'Company picnic', summary: '' }, r, feed('microsoft-blog')), false)
  assert.equal(keep({ title: 'Azure regions', summary: '' }, r, feed('microsoft-blog')), true)
  assert.equal(keep({ title: 'Anything', summary: '' }, r, feed('azure-updates')), true)
  assert.equal(keep({ title: 'Azure webinar', summary: '' }, r, feed('azure-updates')), false)
})

test('rules: alerts by status, product and keyword; bad values dropped', () => {
  const rules = { alerts: { statuses: ['Retiring'], products: ['Copilot'], keywords: ['entra'] } }
  assert.ok(isAlert({ status: 'Retiring', product: 'Azure', title: '', summary: '' }, rules))
  assert.ok(isAlert({ status: 'GA', product: 'Copilot', title: '', summary: '' }, rules))
  assert.ok(isAlert({ status: 'GA', product: 'Azure', title: 'Entra ID news', summary: '' }, rules))
  assert.ok(!isAlert({ status: 'GA', product: 'Azure', title: 'VMs', summary: '' }, rules))
})

test('keywords match at word starts only', () => {
  assert.ok(hasWord('Microsoft Entra ID update', 'entra'))
  assert.ok(!hasWord('centralized management', 'entra'))
  assert.ok(hasWord('(Copilot) news', 'copilot'))
  assert.ok(hasWord('power bi: new visuals', 'power bi'))
  assert.ok(hasWord('a+b c++ notes', 'c++'))
})

test('CDATA and comments cannot end an item early or add fake items', () => {
  const xml = `<rss><channel>
<item><title>Real</title><link>https://example.test/real</link>
<description><![CDATA[<p>code: </item><item><title>Fake copilot retirement</title><link>https://evil.example.test/</link></item><item><title>x</p>]]></description></item>
<!-- </item><item><title>Fake 2</title><link>https://evil.example.test/2</link></item> -->
</channel></rss>`
  const items = parseFeed(xml)
  assert.equal(items.length, 1)
  assert.equal(items[0].title, 'Real')
  assert.equal(items[0].link, 'https://example.test/real')
  assert.match(items[0].summary, /Fake copilot retirement/) // kept only as text
})

test('NUL characters in a feed cannot forge CDATA placeholders', () => {
  const xml = '<rss><channel><item><title>A\u00000\u0000B</title><link>https://example.test/a</link><description><![CDATA[secret]]></description></item></channel></rss>'
  const [a] = parseFeed(xml)
  assert.equal(a.title, 'A0B')
})
