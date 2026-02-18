// Service Worker pour les Push Notifications
// Ce fichier est importé par le SW principal généré par VitePWA

// Config reçue de l'app via postMessage (supabaseUrl, supabaseAnonKey)
let _config = null;

// L'app envoie sa config dès que le SW est prêt
self.addEventListener('message', function(event) {
  if (event.data?.type === 'PARTYSYNC_CONFIG') {
    _config = event.data;
    console.log('[SW] Config received from app');
  }
});

// ─── Push reçu du push service (même app fermée) ─────────────────────────────
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

  // Tag unique par notification → plusieurs notifs visibles simultanément
  const tag = data.id ? `partysync-${data.id}` : `partysync-${Date.now()}`;

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
    tag,
    renotify: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'PartySync', options)
  );
});

// ─── Renouvellement automatique de subscription ───────────────────────────────
// Déclenché par le navigateur quand la subscription change (mise à jour browser,
// expiration, etc.). Sans handler, le nouvel endpoint n'est jamais sauvé en DB
// → tous les pushes ultérieurs échouent silencieusement.
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('[SW] pushsubscriptionchange fired', event);

  event.waitUntil(
    (async () => {
      try {
        // Utiliser la nouvelle subscription si le navigateur l'a déjà créée,
        // sinon re-souscrire avec les mêmes options VAPID
        let newSub = event.newSubscription;

        if (!newSub) {
          const options = event.oldSubscription?.options;
          if (!options?.applicationServerKey) {
            console.warn('[SW] No applicationServerKey for renewal – will re-register on next app open');
            return;
          }
          newSub = await self.registration.pushManager.subscribe(options);
          console.log('[SW] Re-subscribed, new endpoint:', newSub.endpoint);
        }

        const subJson = newSub.toJSON();
        const oldEndpoint = event.oldSubscription?.endpoint;

        if (!_config?.supabaseUrl || !_config?.supabaseAnonKey) {
          // L'app n'a pas encore envoyé sa config (ex: push change en cold start).
          // On informe tous les clients ouverts pour qu'ils re-enregistrent eux-mêmes.
          console.warn('[SW] No Supabase config – notifying clients to re-register');
          const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
          allClients.forEach(c => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
          return;
        }

        // Appeler l'Edge Function renew-push pour mettre à jour l'endpoint en DB
        const resp = await fetch(`${_config.supabaseUrl}/functions/v1/renew-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': _config.supabaseAnonKey,
          },
          body: JSON.stringify({
            oldEndpoint,
            endpoint: newSub.endpoint,
            p256dh: subJson.keys?.p256dh || '',
            auth: subJson.keys?.auth || '',
            ua: navigator.userAgent,
          }),
        });

        if (resp.ok) {
          console.log('[SW] Subscription renewed in DB');
        } else {
          console.warn('[SW] renew-push returned', resp.status);
        }
      } catch (err) {
        console.error('[SW] pushsubscriptionchange error:', err);
      }
    })()
  );
});

// ─── Clic sur une notification ────────────────────────────────────────────────
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
