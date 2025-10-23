/* Prise de contrôle immédiate des clients */
self.addEventListener('install', (event) => {
  // Permet d'activer la nouvelle version sans rechargement
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Contrôler toutes les pages ouvertes immédiatement
  event.waitUntil(self.clients.claim());
  console.log('[SW] activated');
});

function parsePushEventData(event) {
  try {
    if (!event.data) return {};
    // Certains navigateurs envoient directement un objet json()
    return event.data.json();
  } catch (e1) {
    try {
      // D’autres envoient du texte JSON
      const txt = event.data ? event.data.text() : '';
      return txt ? JSON.parse(txt) : {};
    } catch (e2) {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  const data = parsePushEventData(event) || {};
  const title = data.title || 'Notification';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',          // assure-toi que ce fichier existe
    badge: data.badge || '/icon-192.png',        // idem (Android “badge” doit être petit/monochrome idéalement)
    tag: data.tag || 'party-sync',               // même tag = remplace, avec renotify true ça re-sonne
    renotify: true,
    requireInteraction: false,                   // mets true si tu veux qu’elle reste affichée
    data: {
      url: data.url || '/',                      // deep link
      ...data,                                   // conserve le reste du payload pour notificationclick
    },
  };

  console.log('[SW] push received', { title, options });

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const absolute = new URL(url, self.location.origin).href;
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Focaliser un onglet existant qui correspond à l’URL
    for (const client of clientsList) {
      if ('focus' in client && client.url && client.url.startsWith(absolute)) {
        return client.focus();
      }
    }
    // Sinon ouvrir un nouvel onglet
    if (self.clients.openWindow) {
      return self.clients.openWindow(absolute);
    }
  })());
});
