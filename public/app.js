// Uutisvahti page. News text is always put on screen with textContent; links
// are only used when they are https. Read and saved marks live in this
// browser's localStorage and never leave the device.
'use strict'

const PRODUCTS = ['Azure', 'M365', 'Copilot', 'Other']
const STATUSES = ['GA', 'Preview', 'Rolling out', 'In development', 'Retiring', 'Announcement']
const BADGE = { GA: 'b-ga', Preview: 'b-preview', 'Rolling out': 'b-rolling', 'In development': 'b-dev', Retiring: 'b-retiring', Announcement: 'b-ann' }
const PAGE = 60
const KEY = 'uutisvahti.v1'

const $ = (id) => document.getElementById(id)

// ---- storage (best effort: the page works without it) ----
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      read: new Set(Array.isArray(s.read) ? s.read : []),
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

// ---- filtering ----
function visibleItems() {
  let items = state.view === 'saved' ? Object.values(state.saved) : data.items
  if (state.view === 'unread') items = items.filter((i) => !state.read.has(i.id))
  if (state.products.length) items = items.filter((i) => state.products.includes(i.product))
  if (state.statuses.length) items = items.filter((i) => state.statuses.includes(i.status))
  if (query) {
    // Each word must match at the start of a word: "entra" finds "Entra", not "central".
    const res = query.split(/\s+/).filter(Boolean)
      .map((w) => new RegExp('(?:^|[^\\p{L}\\p{N}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu'))
    items = items.filter((i) => {
      const t = `${i.title} ${i.summary} ${(i.categories || []).join(' ')} ${i.product} ${i.status}`
      return res.every((re) => re.test(t))
    })
  }
  return items.slice().sort((a, b) => String(b.date || b.seen).localeCompare(String(a.date || a.seen)))
}

// ---- rendering ----
function renderChips(container, values, selected) {
  container.replaceChildren(...values.map((v) => {
    const b = el('button', 'chip', v)
    b.type = 'button'
    b.setAttribute('aria-pressed', String(selected.includes(v)))
    b.addEventListener('click', () => {
      const i = selected.indexOf(v)
      if (i >= 0) selected.splice(i, 1); else selected.push(v)
      limit = PAGE
      persist(); render()
    })
    return b
  }))
}

const sourceName = (id) => (data.sources.find((s) => s.id === id) || {}).name || id

function itemNode(it) {
  const card = el('article', 'item' + (state.read.has(it.id) ? '' : ' unread'))
  const meta = el('div', 'meta')
  meta.append(el('span', 'badge ' + (BADGE[it.status] || 'b-ann'), it.status), el('span', 'product', it.product), el('span', null, sourceName(it.source)))
  if (it.date) meta.append(el('span', null, timeFmt.format(new Date(it.date))))
  const href = safeHref(it.link)
  const title = el(href ? 'a' : 'span', 'title', it.title)
  if (href) {
    title.href = href
    title.target = '_blank'
    title.rel = 'noopener noreferrer'
    title.addEventListener('click', () => { state.read.add(it.id); persist(); card.classList.remove('unread'); updateCounts() })
  }
  card.append(meta, title)
  if (it.summary) {
    const s = el('p', 'summary', it.summary)
    s.addEventListener('click', () => s.classList.toggle('open'))
    card.append(s)
  }
  const save = el('button', 'save', state.saved[it.id] ? '★' : '☆')
  save.type = 'button'
  save.setAttribute('aria-pressed', String(Boolean(state.saved[it.id])))
  save.setAttribute('aria-label', (state.saved[it.id] ? 'Remove from saved: ' : 'Save: ') + it.title)
  save.addEventListener('click', () => {
    if (state.saved[it.id]) delete state.saved[it.id]; else state.saved[it.id] = it
    persist()
    if (state.view === 'saved') render()
    else { save.textContent = state.saved[it.id] ? '★' : '☆'; save.setAttribute('aria-pressed', String(Boolean(state.saved[it.id]))); updateCounts() }
  })
  card.append(save)
  return card
}

function updateCounts() {
  const unread = data.items.filter((i) => !state.read.has(i.id)).length
  $('unread-count').textContent = unread ? String(unread) : ''
  const saved = Object.keys(state.saved).length
  $('saved-count').textContent = saved ? String(saved) : ''
}

function render() {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.view === state.view)))
  renderChips($('product-chips'), PRODUCTS, state.products)
  renderChips($('status-chips'), STATUSES, state.statuses)
  updateCounts()

  const items = visibleItems()
  const list = $('list')
  const nodes = []
  let lastDay = ''
  for (const it of items.slice(0, limit)) {
    const d = dayLabel(it.date || it.seen)
    if (d !== lastDay) { nodes.push(el('h2', 'day', d)); lastDay = d }
    nodes.push(itemNode(it))
  }
  list.replaceChildren(...nodes)
  $('more').hidden = items.length <= limit
  $('more').textContent = `Show more (${items.length - limit} left)`
  const empty = $('empty')
  empty.hidden = items.length > 0
  empty.textContent = state.view === 'saved' ? 'Nothing saved yet. Tap ☆ on a story to keep it here.'
    : state.view === 'unread' ? 'All caught up.' : 'No news matches these filters.'
  $('mark-all').hidden = state.view === 'saved' || items.length === 0
}

function renderHeader() {
  if (data.generated) {
    const g = new Date(data.generated)
    $('updated').textContent = `Updated ${dayLabel(data.generated).toLowerCase() === 'today' ? '' : dayFmt.format(g) + ' '}${timeFmt.format(g)}`
  }
  const failed = data.sources.filter((s) => !s.ok)
  const notice = $('notice')
  notice.hidden = failed.length === 0
  notice.textContent = failed.length ? `Couldn't refresh: ${failed.map((s) => s.name).join(', ')}. Showing earlier items from them.` : ''
  $('sources').textContent = 'Sources: ' + data.sources.map((s) => s.name).join(' · ')
}

// ---- events ----
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  state.view = t.dataset.view; limit = PAGE; persist(); render(); window.scrollTo({ top: 0 })
}))
let qTimer
$('q').addEventListener('input', (e) => {
  clearTimeout(qTimer)
  qTimer = setTimeout(() => { query = e.target.value.trim(); limit = PAGE; render() }, 120)
})
$('more').addEventListener('click', () => { limit += PAGE; render() })
$('mark-all').addEventListener('click', () => {
  for (const it of visibleItems()) state.read.add(it.id)
  persist(); render()
})

// ---- load ----
async function load() {
  try {
    const res = await fetch('items.json', { cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json()
    data = { items: Array.isArray(json.items) ? json.items : [], sources: Array.isArray(json.sources) ? json.sources : [], generated: json.generated || null }
    // First visit: everything older than a week counts as read, so "Unread" is useful from day one.
    if (state.firstVisit) {
      const weekAgo = Date.now() - 7 * 86400000
      for (const it of data.items) if (new Date(it.date || it.seen).getTime() < weekAgo) state.read.add(it.id)
      state.firstVisit = false
      persist()
    }
    renderHeader()
    render()
  } catch (e) {
    $('updated').textContent = 'Offline'
    const n = $('notice'); n.hidden = false
    n.textContent = 'Couldn’t load the news. It tries again when you come back to this page.'
    render()
  }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load() })
load()
