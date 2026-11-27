// One batched ntfy push per run for new items that match an alert rule.
// A failed push is logged and never fails the build.

const TOPIC_RE = /^[A-Za-z0-9_-]{16,64}$/
const MAX_LINES = 6

export function buildMessage(alerts, siteUrl) {
  const n = alerts.length
  const title = n === 1 ? `Uutisvahti: ${alerts[0].status} · ${alerts[0].product}` : `Uutisvahti: ${n} new alerts`
  const lines = alerts.slice(0, MAX_LINES).map((a) => `• [${a.status}] ${a.title}`)
  if (n > MAX_LINES) lines.push(`…and ${n - MAX_LINES} more`)
  const click = n === 1 ? alerts[0].link : siteUrl || undefined
  const urgent = alerts.some((a) => a.status === 'Retiring')
  return { title, message: lines.join('\n'), click, tags: [urgent ? 'warning' : 'newspaper'], priority: urgent ? 4 : 3 }
}

export async function sendAlerts(alerts, { topic, server = 'https://ntfy.sh', siteUrl, fetchImpl = fetch, log = console } = {}) {
  if (!alerts.length) return { sent: false, reason: 'no alerts' }
  if (!topic) return { sent: false, reason: 'NTFY_TOPIC not set' }
  if (!TOPIC_RE.test(topic)) return { sent: false, reason: 'NTFY_TOPIC must be 16-64 letters, digits, - or _' }
  if (!/^https:\/\//.test(server)) return { sent: false, reason: 'NTFY_SERVER must be https://' }
  const body = { topic, ...buildMessage(alerts, siteUrl) }
  try {
    const res = await fetchImpl(server.replace(/\/$/, '') + '/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { sent: true, count: alerts.length }
  } catch (e) {
    log.warn(`ntfy push failed: ${e.message}`)
    return { sent: false, reason: e.message }
  }
}
