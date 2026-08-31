/* Service worker — deliberately a pass-through.
   It exists so the app is installable (Add to Home Screen / Install app), and
   for nothing else. NO caching happens here on purpose: this project already
   fought stale-bundle bugs twice (Cloudflare edge-cached index.html served old
   JS for hours), and a caching service worker is the same failure mode with a
   longer memory. The network, with the no-store headers on HTML, is the truth. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => { /* let every request hit the network */ })

/* Web push (064) — payload is JSON {title, body, link} from our worker. */
self.addEventListener('push', (e) => {
  let data = { title: 'IQI AG Hero', body: '', link: '/notifications' }
  try { data = { ...data, ...e.data.json() } } catch { /* keep defaults */ }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { link: data.link },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const link = e.notification.data?.link || '/notifications'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
    for (const tab of tabs) {
      if ('focus' in tab) { tab.navigate(link); return tab.focus() }
    }
    return self.clients.openWindow(link)
  }))
})
