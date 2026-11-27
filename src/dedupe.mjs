import { createHash } from 'node:crypto'

export function normalizeLink(link) {
  try {
    const u = new URL(link)
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^ocid$|^wt\./i.test(k)) u.searchParams.delete(k)
    u.hostname = u.hostname.toLowerCase()
    return u.toString().replace(/\/$/, '')
  } catch {
    return link.trim()
  }
}

export const normalizeTitle = (t) =>
  t.toLowerCase().replace(/^\[[^\]]*\]\s*/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export const itemId = (link) => createHash('sha256').update(normalizeLink(link)).digest('hex').slice(0, 16)

/** Drop duplicates by link and by title. The first item (newest, after sorting) wins. */
export function dedupe(items) {
  const links = new Set()
  const titles = new Set()
  const out = []
  for (const it of items) {
    const l = normalizeLink(it.link)
    const t = normalizeTitle(it.title)
    if (links.has(l) || (t && titles.has(t))) continue
    links.add(l)
    if (t) titles.add(t)
    out.push(it)
  }
  return out
}
