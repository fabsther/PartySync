/* Minimal SW to afficher des Web Push */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const title = data.title || 'Notification';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/badge-72.png',
    data, // { url, partyId, ... }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const alreadyOpen = allClients.find((c) => c.url.includes(new URL(url, self.location.origin).pathname));
      if (alreadyOpen) return alreadyOpen.focus();
      return self.clients.openWindow(url);
    })()
  );
});
