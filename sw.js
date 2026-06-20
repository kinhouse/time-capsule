const CACHE = 'future-cal-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  if (!e.request.url.startsWith(self.location.origin)) return

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request)
      const networkPromise = fetch(e.request).then(response => {
        if (response.ok) cache.put(e.request, response.clone())
        return response
      }).catch(() => null)

      return cached ?? await networkPromise
    })
  )
})
