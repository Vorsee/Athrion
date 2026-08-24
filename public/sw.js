const CACHE = 'athrion-v1'

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
