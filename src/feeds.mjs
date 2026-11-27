// The news sources. `broad: true` feeds cover more than Azure/M365/Copilot, so
// their items must match an `include` keyword in config/rules.json to be kept.
// `product` is the default product when nothing more specific matches.

export const FEEDS = [
  { id: 'azure-updates', name: 'Azure Updates', url: 'https://www.microsoft.com/releasecommunications/api/v2/azure/rss', product: 'Azure', fixture: 'azure-updates.xml' },
  { id: 'm365-roadmap', name: 'Microsoft 365 Roadmap', url: 'https://www.microsoft.com/releasecommunications/api/v2/m365/rss', product: 'M365', fixture: 'm365-roadmap.xml' },
  { id: 'azure-blog', name: 'Azure Blog', url: 'https://azure.microsoft.com/en-us/blog/feed/', product: 'Azure', fixture: 'azure-blog.xml' },
  { id: 'copilot-blog', name: 'Microsoft 365 / Copilot Blog', url: 'https://www.microsoft.com/en-us/microsoft-365/blog/feed/', product: 'Copilot', fixture: 'copilot-blog.xml' },
  { id: 'microsoft-blog', name: 'Official Microsoft Blog', url: 'https://blogs.microsoft.com/feed/', product: 'Other', broad: true, fixture: 'microsoft-blog.xml' },
  { id: 'm365-dev-blog', name: 'Microsoft 365 Developer Blog', url: 'https://devblogs.microsoft.com/microsoft365dev/feed/', product: 'M365', fixture: 'm365-dev-blog.xml' },
  { id: 'techcommunity', name: 'Tech Community', url: 'https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/Community', product: 'Other', broad: true, fixture: 'techcommunity.xml' },
  { id: 'azure-infra-blog', name: 'Azure Infrastructure Blog', url: 'https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id=AzureInfrastructureBlog', product: 'Azure', fixture: 'azure-infra-blog.xml' },
]

const TIMEOUT_MS = 30_000
const USER_AGENT = 'Uutisvahti/0.1 (RSS reader)'

/** Fetch one feed's XML. Throws on network errors, timeouts and non-2xx answers. */
export async function fetchFeed(feed, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(feed.url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`${feed.id}: HTTP ${res.status}`)
  return await readLimited(res, MAX_BYTES)
}

// The biggest real feed (M365 Roadmap) is about 3 MB. Anything far larger is
// broken or hostile, and would only slow the parser down.
export const MAX_BYTES = 20 * 1024 * 1024

/** Read a response body as text, failing once it passes maxBytes. */
export async function readLimited(res, maxBytes) {
  const declared = Number(res.headers.get('content-length'))
  if (declared > maxBytes) throw new Error(`response too large (${declared} bytes)`)
  if (!res.body) return ''
  const chunks = []
  let size = 0
  for await (const chunk of res.body) {
    size += chunk.byteLength
    if (size > maxBytes) throw new Error(`response too large (over ${maxBytes} bytes)`)
    chunks.push(chunk)
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks))
}
