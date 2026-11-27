// Small RSS 2.0 and Atom reader. The feeds we read are well-formed and flat, so a
// full XML parser (and its dependencies) is not needed. Everything returned is
// plain text: tags are removed and entities decoded, and the page puts it on
// screen with textContent only.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''
    }
    return NAMED[e.toLowerCase()] ?? m
  })
}

// CDATA sections and comments are taken out of the XML before it is split into
// items, so text inside them (for example "</item>" in a blog post's HTML) can
// never end an item early or create a fake one. Each CDATA section is replaced
// by a placeholder "\u0000<n>\u0000" and put back as plain text by rawText().
const MARK = /\u0000(\d+)\u0000/g
let cdata = []

function mask(xml) {
  cdata = []
  return xml
    .replace(/\u0000/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)(?:\]\]>|$)/g, (_, c) => `\u0000${cdata.push(c) - 1}\u0000`)
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
}

// Raw element content -> text: CDATA put back, entities decoded outside CDATA.
function rawText(s) {
  let out = ''
  let last = 0
  for (const m of s.matchAll(MARK)) {
    out += decodeEntities(s.slice(last, m.index)) + (cdata[Number(m[1])] ?? '')
    last = m.index + m[0].length
  }
  return out + decodeEntities(s.slice(last))
}

// HTML (from a description) -> one line of plain text.
export function htmlToText(html) {
  let t = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/?(?:p|li|div|ul|ol|h[1-6]|tr|td|table)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
  t = decodeEntities(t)
  return t.replace(/\s+/g, ' ').trim()
}

function blocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g')
  return [...xml.matchAll(re)].map((m) => m[1])
}

function children(block, tag) {
  const re = new RegExp(`<${tag}(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g')
  return [...block.matchAll(re)].map((m) => ({ attrs: m[1] ?? '', body: m[2] ?? '' }))
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`))
  return m ? decodeEntities(m[2] ?? m[3]) : ''
}

function first(block, ...tags) {
  for (const t of tags) {
    const c = children(block, t)[0]
    if (c) return rawText(c.body).trim()
  }
  return ''
}

function toIso(s) {
  if (!s) return null
  // Microsoft's release feeds write "Wed, 25 Nov 2026 23:14:20 Z".
  const d = new Date(s.replace(/ Z$/, ' GMT'))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const MAX_SUMMARY = 400

function summary(text) {
  const t = htmlToText(text)
  return t.length > MAX_SUMMARY ? t.slice(0, MAX_SUMMARY - 1).trimEnd() + '…' : t
}

/** Parse RSS or Atom XML into raw entries {guid, title, link, date, categories, summary}. */
export function parseFeed(input) {
  const xml = mask(input)
  const isAtom = /<feed[\s>]/.test(xml) && !/<rss[\s>]/.test(xml)
  if (isAtom) {
    return blocks(xml, 'entry').map((b) => {
      const links = children(b, 'link')
      const alt = links.find((l) => !/rel\s*=/.test(l.attrs) || attr(l.attrs, 'rel') === 'alternate') ?? links[0]
      return {
        guid: first(b, 'id'),
        title: htmlToText(first(b, 'title')),
        link: alt ? attr(alt.attrs, 'href') : '',
        date: toIso(first(b, 'updated', 'published')),
        categories: children(b, 'category').map((c) => attr(c.attrs, 'term')).filter(Boolean),
        summary: summary(first(b, 'summary', 'content')),
      }
    })
  }
  return blocks(xml, 'item').map((b) => ({
    guid: first(b, 'guid'),
    title: htmlToText(first(b, 'title')),
    link: first(b, 'link'),
    date: toIso(first(b, 'pubDate', 'a10:updated', 'dc:date')),
    categories: children(b, 'category').map((c) => rawText(c.body).trim()).filter(Boolean),
    summary: summary(first(b, 'description', 'content:encoded')),
  }))
}
