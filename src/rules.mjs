import { readFileSync } from 'node:fs'
import { STATUSES, PRODUCTS } from './classify.mjs'

const lower = (a) => (Array.isArray(a) ? a.map((s) => String(s).toLowerCase().trim()).filter(Boolean) : [])

/** Read and validate config/rules.json. Unknown values are dropped, never trusted. */
export function loadRules(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const alerts = raw.alerts ?? {}
  return {
    keepDays: Number.isInteger(raw.keepDays) && raw.keepDays > 0 && raw.keepDays <= 365 ? raw.keepDays : 90,
    feeds: raw.feeds && typeof raw.feeds === 'object' ? raw.feeds : {},
    include: lower(raw.include),
    exclude: lower(raw.exclude),
    alerts: {
      statuses: (alerts.statuses ?? []).filter((s) => STATUSES.includes(s)),
      products: (alerts.products ?? []).filter((p) => PRODUCTS.includes(p)),
      keywords: lower(alerts.keywords),
    },
  }
}

// Keyword match at the start of a word: "entra" matches "Entra ID", not "central".
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const cache = new Map()
export function hasWord(text, keyword) {
  let re = cache.get(keyword)
  if (!re) { re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc(keyword)}`, 'iu'); cache.set(keyword, re) }
  return re.test(text)
}

const haystack = (item) => `${item.title} ${item.summary} ${(item.categories ?? []).join(' ')}`.toLowerCase()

export function feedEnabled(rules, feedId) {
  return rules.feeds[feedId] !== false
}

/** Keep the item? Exclude always wins; broad feeds also need an include match. */
export function keep(item, rules, feed) {
  const text = haystack(item)
  if (rules.exclude.some((k) => hasWord(text, k))) return false
  if (feed.broad) return rules.include.some((k) => hasWord(text, k))
  return true
}

/** Does the item match an alert rule? */
export function isAlert(item, rules) {
  const a = rules.alerts
  if (a.statuses.includes(item.status)) return true
  if (a.products.includes(item.product)) return true
  const text = haystack(item)
  return a.keywords.some((k) => hasWord(text, k))
}
