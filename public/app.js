// Uutisvahti page. News text is always put on screen with textContent; links
// are only used when they are https. Read and saved marks live in this
// browser's localStorage and never leave the device.
'use strict'

const PRODUCTS = ['Azure', 'M365', 'Copilot', 'Other']
const STATUSES = ['GA', 'Preview', 'Rolling out', 'In development', 'Retiring', 'Announcement']
const PRODUCT_LABEL = { Azure: 'Azure', M365: 'Microsoft 365', Copilot: 'Copilot', Other: 'Other (Dynamics, Power Platform…)' }
const STATUS_LABEL = { GA: 'Generally available', Preview: 'Preview', 'Rolling out': 'Rolling out', 'In development': 'In development', Retiring: 'Retiring', Announcement: 'Announcement' }
const PRODUCT_SHORT = { Azure: 'Azure', M365: 'Microsoft 365', Copilot: 'Copilot', Other: 'Other' }
const BADGE = { GA: 'b-ga', Preview: 'b-preview', 'Rolling out': 'b-rolling', 'In development': 'b-dev', Retiring: 'b-retiring', Announcement: 'b-ann' }
const PAGE = 60
const KEY = 'uutisvahti.v1'

const $ = (id) => document.getElementById(id)

// ---- storage (best effort: the page works without it) ----
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      read: new Set(Array.isArray(s.read) ? s.read.filter((x) => typeof x === 'string') : []),
      saved: s.saved && typeof s.saved === 'object' ? s.saved : {},
      products: Array.isArray(s.products) ? s.products.filter((p) => PRODUCTS.includes(p)) : [],
      statuses: Array.isArray(s.statuses) ? s.statuses.filter((p) => STATUSES.includes(p)) : [],
      view: ['all', 'unread', 'saved'].includes(s.view) ? s.view : 'all',
      firstVisit: !s.read,
    }
  } catch {
    return { read: new Set(), saved: {}, products: [], statuses: [], view: 'all', firstVisit: true }
  }
}
const state = loadState()
let data = { items: [], sources: [], generated: null }
let loaded = false
let query = ''
let limit = PAGE

function persist() {
  try {
    // Keep the read list bounded to items that still exist (plus saved ones).
    const live = new Set(data.items.map((i) => i.id))
    const read = [...state.read].filter((id) => live.has(id) || state.saved[id])
    localStorage.setItem(KEY, JSON.stringify({ read, saved: state.saved, products: state.products, statuses: state.statuses, view: state.view }))
  } catch { /* private mode or storage full: marks just won't persist */ }
}

// ---- helpers ----
function safeHref(link) {
  try {
    const u = new URL(link)
    return u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date(today); y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return dayFmt.format(d)
}
function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const filtersActive = () => state.products.length > 0 || state.statuses.length > 0 || query !== ''

// ---- filtering ----
function searchMatchers() {
  // Each word must match at the start of a word: "entra" finds "Entra", not "central".
  return query.split(/\s+/).filter(Boolean)
    .map((w) => new RegExp('(?:^|[^\\p{L}\\p{N}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu'))
}
function visibleItems() {
  let items = state.view === 'saved' ? Object.values(state.saved) : data.items
  if (state.view === 'unread') items = items.filter((i) => !state.read.has(i.id))
  if (state.products.length) items = items.filter((i) => state.products.includes(i.product))
  if (state.statuses.length) items = items.filter((i) => state.statuses.includes(i.status))
  if (query) {
    const res = searchMatchers()
    items = items.filter((i) => {
      const t = `${i.title} ${i.summary} ${(i.categories || []).join(' ')} ${PRODUCT_SHORT[i.product] || ''} ${STATUS_LABEL[i.status] || ''}`
      return res.every((re) => re.test(t))
    })
  }
  return items.slice().sort((a, b) => String(b.date || b.seen).localeCompare(String(a.date || a.seen)))
}

// ---- rendering ----
function renderChips(container, values, labels, selected) {
  container.replaceChildren(...values.map((v) => {
    const b = el('button', 'chip', labels[v])
    b.type = 'button'
    b.setAttribute('aria-pressed', String(selected.includes(v)))
    b.addEventListener('click', () => {
      const i = selected.indexOf(v)
      if (i >= 0) selected.splice(i, 1); else selected.push(v)
      limit = PAGE
      persist(); render()
      // Chips are rebuilt on render; keep keyboard focus on the same chip.
      const again = [...container.querySelectorAll('.chip')].find((c) => c.textContent === labels[v])
      if (again) again.focus()
    })
    return b
  }))
}

const sourceName = (id) => (data.sources.find((s) => s.id === id) || {}).name || id

function setReadButton(btn, it) {
  const isRead = state.read.has(it.id)
  btn.textContent = isRead ? '○' : '✓'
  btn.setAttribute('aria-label', (isRead ? 'Mark as unread: ' : 'Mark as read: ') + it.title)
  btn.title = isRead ? 'Mark as unread' : 'Mark as read'
}

function markRead(it, card, readBtn, value) {
  if (value) state.read.add(it.id); else state.read.delete(it.id)
  persist()
  card.classList.toggle('unread', !value)
  const label = card.querySelector('.new-label')
  if (label) label.hidden = value
  setReadButton(readBtn, it)
  updateCounts()
}

function itemNode(it) {
  const unread = !state.read.has(it.id)
  const card = el('article', 'item' + (unread ? ' unread' : ''))
  const meta = el('div', 'meta')
  const newLabel = el('span', 'new-label', 'New')
  newLabel.hidden = !unread
  meta.append(newLabel, el('span', 'badge ' + (BADGE[it.status] || 'b-ann'), STATUS_LABEL[it.status] || it.status),
    el('span', 'product', PRODUCT_SHORT[it.product] || it.product), el('span', null, sourceName(it.source)))
  if (it.date) meta.append(el('span', null, timeFmt.format(new Date(it.date))))

  const actions = el('div', 'actions')
  const save = el('button', 'icon-btn save', state.saved[it.id] ? '★' : '☆')
  save.type = 'button'
  save.title = 'Save for later'
  save.setAttribute('aria-label', 'Save: ' + it.title)
  save.setAttribute('aria-pressed', String(Boolean(state.saved[it.id])))
  save.addEventListener('click', () => {
    if (state.saved[it.id]) delete state.saved[it.id]; else state.saved[it.id] = it
    persist()
    if (state.view === 'saved') {
      render()
      showToast('Removed from saved.', () => { state.saved[it.id] = it; persist(); render() })
    } else {
      save.textContent = state.saved[it.id] ? '★' : '☆'
      save.setAttribute('aria-pressed', String(Boolean(state.saved[it.id])))
      updateCounts()
    }
  })
  const readBtn = el('button', 'icon-btn read')
  readBtn.type = 'button'
  setReadButton(readBtn, it)
  readBtn.addEventListener('click', () => markRead(it, card, readBtn, !state.read.has(it.id)))
  actions.append(save, readBtn)

  const href = safeHref(it.link)
  const title = el(href ? 'a' : 'span', 'title', it.title)
  if (href) {
    title.href = href
    title.target = '_blank'
    title.rel = 'noopener noreferrer'
    title.addEventListener('click', () => markRead(it, card, readBtn, true))
  }
  card.append(meta, title)
  if (it.summary) {
    const s = el('p', 'summary', it.summary)
    s.addEventListener('click', () => s.classList.toggle('open'))
    card.append(s)
  }
  card.append(actions)
  return card
}

function updateCounts() {
  const unread = data.items.filter((i) => !state.read.has(i.id)).length
  $('unread-count').textContent = unread ? String(unread) : ''
  const saved = Object.keys(state.saved).length
  $('saved-count').textContent = saved ? String(saved) : ''
}

function describeFilters() {
  const parts = []
  if (state.products.length) parts.push(state.products.map((p) => PRODUCT_SHORT[p]).join(' or '))
  if (state.statuses.length) parts.push(state.statuses.map((s) => STATUS_LABEL[s]).join(' or '))
  if (query) parts.push(`“${query}”`)
  return parts.join(' · ')
}

function render() {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.view === state.view)))
  renderChips($('product-chips'), PRODUCTS, PRODUCT_LABEL, state.products)
  renderChips($('status-chips'), STATUSES, STATUS_LABEL, state.statuses)
  updateCounts()
  if (!loaded) return

  const items = visibleItems()
  const nodes = []
  let lastDay = ''
  for (const it of items.slice(0, limit)) {
    const d = dayLabel(it.date || it.seen)
    if (d !== lastDay) { nodes.push(el('h2', 'day', d)); lastDay = d }
    nodes.push(itemNode(it))
  }
  $('list').replaceChildren(...nodes)

  const active = filtersActive()
  const what = state.view === 'saved' ? 'saved' : state.view === 'unread' ? 'unread' : ''
  $('result-count').textContent = plural(items.length, `${what} story`.trim(), `${what} stories`.trim()) + (active ? ` matching ${describeFilters()}` : '')
  $('result-count').hidden = items.length === 0
  $('clear').hidden = !active || items.length === 0

  const more = items.length - limit
  $('more').hidden = more <= 0
  $('more').textContent = `Show ${Math.min(more, PAGE)} more (${more} left)`

  $('end').hidden = items.length === 0 || more > 0
  $('end').textContent = items.length > 1 ? `That's everything – ${plural(items.length, 'story', 'stories')}.` : ''

  $('empty').hidden = items.length > 0
  $('empty-clear').hidden = !active
  $('empty-text').textContent = active
    ? `No ${what ? what + ' ' : ''}stories match ${describeFilters()}.`
    : state.view === 'saved' ? 'Nothing saved yet. Tap ☆ on a story to keep it here.'
      : state.view === 'unread' ? 'All caught up – nothing unread.' : 'No news yet.'

  const unreadShown = items.filter((i) => !state.read.has(i.id)).length
  $('mark-all').hidden = state.view === 'saved' || unreadShown === 0
  $('mark-all').textContent = active ? `Mark these ${unreadShown} as read` : `Mark all ${unreadShown} as read`
}

function renderHeader() {
  if (data.generated) {
    const g = new Date(data.generated)
    $('updated').textContent = `Updated ${dayLabel(data.generated).toLowerCase()} ${timeFmt.format(g)}`
  }
  const failed = data.sources.filter((s) => !s.ok)
  const notice = $('notice')
  notice.hidden = failed.length === 0
  notice.textContent = failed.length ? `Couldn't refresh: ${failed.map((s) => s.name).join(', ')}. Showing earlier items from them.` : ''
  $('sources').textContent = 'Sources: ' + data.sources.map((s) => s.name).join(' · ')
}

// ---- toast with undo ----
let toastTimer
let undoFn = null
function showToast(text, undo) {
  clearTimeout(toastTimer)
  undoFn = undo
  $('toast-text').textContent = text
  $('toast').hidden = false
  $('toast-undo').focus()
  toastTimer = setTimeout(hideToast, 8000)
}
function hideToast() {
  $('toast').hidden = true
  undoFn = null
}
$('toast-undo').addEventListener('click', () => {
  const fn = undoFn
  hideToast()
  if (fn) fn()
  $('list').focus()
})

// ---- events ----
function clearFilters() {
  state.products.length = 0
  state.statuses.length = 0
  query = ''
  $('q').value = ''
  limit = PAGE
  persist(); render()
  $('q').focus()
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  state.view = t.dataset.view; limit = PAGE; persist(); render()
}))
let qTimer
$('q').addEventListener('input', (e) => {
  clearTimeout(qTimer)
  qTimer = setTimeout(() => { query = e.target.value.trim(); limit = PAGE; render() }, 120)
})
$('clear').addEventListener('click', clearFilters)
$('empty-clear').addEventListener('click', clearFilters)
$('more').addEventListener('click', () => { limit += PAGE; render() })
$('mark-all').addEventListener('click', () => {
  const ids = visibleItems().map((i) => i.id).filter((id) => !state.read.has(id))
  if (!ids.length) return
  for (const id of ids) state.read.add(id)
  persist(); render()
  showToast(`Marked ${plural(ids.length, 'story', 'stories')} as read.`, () => {
    for (const id of ids) state.read.delete(id)
    persist(); render()
  })
})

// ---- load ----
async function load() {
  try {
    const res = await fetch('items.json', { cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json()
    data = { items: Array.isArray(json.items) ? json.items : [], sources: Array.isArray(json.sources) ? json.sources : [], generated: json.generated || null }
    loaded = true
    // First visit: everything older than a week counts as read, so "Unread" is useful from day one.
    if (state.firstVisit) {
      const weekAgo = Date.now() - 7 * 86400000
      for (const it of data.items) if (new Date(it.date || it.seen).getTime() < weekAgo) state.read.add(it.id)
      state.firstVisit = false
      persist()
    }
    renderHeader()
    render()
  } catch {
    $('updated').textContent = 'Offline'
    const n = $('notice'); n.hidden = false
    n.textContent = 'Couldn’t load the news. It tries again when you come back to this page.'
    if (!loaded) $('list').replaceChildren()
  }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load() })
render()
load()
