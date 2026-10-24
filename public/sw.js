const CACHE = 'athrion-v3'

// On install: take control immediately, no waiting
self.addEventListener('install', () => self.skipWaiting())

// On activate: delete any old cache versions
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // Never intercept: non-GET, Supabase, external APIs, Vercel API routes
  if (
    request.method !== 'GET' ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.com') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('stripe.com') ||
    url.hostname.includes('openfoodfacts.org') ||
    url.pathname.startsWith('/api/')
  ) return

  // Navigation (HTML pages): network first, fall back to cached shell
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => { cache(request, res.clone()); return res })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // Static assets (JS, CSS, fonts, icons): cache first, update in background
  e.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(res => { cache(request, res.clone()); return res })
      return cached ?? network
    })
  )
})

function cache(request, response) {
  if (response.ok) caches.open(CACHE).then(c => c.put(request, response))
}

// ── Push reminders (sent by the send-reminders Edge Function) ────────────────
self.addEventListener('push', e => {
  let data = {}
  try { data = e.data?.json() ?? {} } catch { data = { body: e.data?.text() } }
  e.waitUntil(
    self.registration.showNotification(data.title || 'ATHRION', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'athrion-reminder',
      data: { url: data.url || '/' },
    })
  )
})

// Focus an open app window, or open one
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const win = wins.find(w => new URL(w.url).origin === self.location.origin)
      if (win) { win.focus(); return win.navigate(url) }
      return self.clients.openWindow(url)
    })
  )
})
