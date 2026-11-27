// Product and status for each item. The feed's own categories win; keyword rules
// on the title and summary fill in the rest.

export const PRODUCTS = ['Azure', 'M365', 'Copilot', 'Other']
export const STATUSES = ['GA', 'Preview', 'Rolling out', 'In development', 'Retiring', 'Announcement']

// Order matters: the first match wins.
const STATUS_FROM_CATEGORY = [
  [/^retirements?$|^retiring$/i, 'Retiring'],
  [/^cancelled$/i, 'Retiring'],
  [/^in development$/i, 'In development'],
  [/^rolling out$/i, 'Rolling out'],
  [/^in preview$/i, 'Preview'],
  [/^launched$|^generally available$/i, 'GA'],
]

const STATUS_FROM_TEXT = [
  [/\bretire(?:ment|s|d)?\b|\bretiring\b|\bdeprecat|\bend of (?:support|life)\b|\bsunset/i, 'Retiring'],
  [/\[in preview\]|\bpublic preview\b|\bprivate preview\b|\bin preview\b|\bpreview\b/i, 'Preview'],
  [/\[launched\]|\bgenerally available\b|\bgeneral availability\b|\bnow available\b|\b(?:is )?ga\b/i, 'GA'],
  [/\brolling out\b|\brollout\b/i, 'Rolling out'],
]

const COPILOT = /\bcopilot\b/i
const M365 = /\bmicrosoft 365\b|\bm365\b|\boffice 365\b|\bteams\b|\bsharepoint\b|\bonedrive\b|\bexchange\b|\boutlook\b|\bword\b|\bexcel\b|\bpowerpoint\b|\bintune\b|\bpurview\b|\bviva\b|\bplanner\b|\bloop\b/i
const BIZAPPS = /^(?:dynamics 365|microsoft dynamics|power apps|power automate|power pages|microsoft power platform|power platform|microsoft copilot studio)\b/i
const AZURE = /\bazure\b|\bentra\b|\bfoundry\b|\baks\b|\bcosmos db\b|\bfabric\b/i

export function classifyStatus({ categories = [], title = '', summary = '' }, feedId) {
  // The M365 roadmap lists "General Availability" and "Preview" as release
  // *phases* on every item; only its status category ("In development",
  // "Rolling out", "Launched") says where the item is now.
  for (const [re, status] of STATUS_FROM_CATEGORY) {
    if (categories.some((c) => re.test(c))) return status
  }
  if (feedId === 'm365-roadmap') return 'In development'
  const text = `${title} ${summary}`
  // Title first: "Retirement: ..." should not lose to "... now available" in the body.
  for (const [re, status] of STATUS_FROM_TEXT) if (re.test(title)) return status
  for (const [re, status] of STATUS_FROM_TEXT) if (re.test(text)) return status
  return 'Announcement'
}

export function classifyProduct({ categories = [], title = '', summary = '' }, feed) {
  const text = `${title} ${categories.join(' ')}`
  if (COPILOT.test(text)) return 'Copilot'
  // Dynamics 365 and Power Platform are on the M365 roadmap but are their own world.
  if (BIZAPPS.test(title)) return 'Other'
  if (feed.product === 'Azure' || feed.product === 'M365') return feed.product
  if (M365.test(text)) return 'M365'
  if (AZURE.test(text)) return 'Azure'
  const body = `${text} ${summary}`
  if (COPILOT.test(body)) return 'Copilot'
  if (AZURE.test(body)) return 'Azure'
  if (M365.test(body)) return 'M365'
  return feed.product ?? 'Other'
}
