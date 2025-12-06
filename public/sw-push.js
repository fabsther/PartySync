// Service Worker pour les Push Notifications
// Ce fichier est importé par le SW principal généré par VitePWA

self.addEventListener('push', function(event) {
  console.log('[SW] Push received:', event);
  
  let data = { title: 'PartySync', body: 'Nouvelle notification' };
  
  if (event.data) {
    try {
      data = event.data.json();
      console.log('[SW] Push data:', data);
    } catch (e) {
      console.log('[SW] Push data (text):', event.data.text());
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || data.message || 'Nouvelle notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      ...data
    },
    actions: [
      { action: 'open', title: 'Ouvrir' },
      { action: 'close', title: 'Fermer' }
    ],
    tag: 'partysync-notification',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'PartySync', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification click:', event);
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Si une fenêtre est déjà ouverte, focus dessus
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (urlToOpen !== '/') {
            client.navigate(urlToOpen);
          }
          return;
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

console.log('[SW] Push handler loaded');
