import { supabase } from './supabase';

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }

  return Notification.permission;
}

export async function registerNotificationToken(userId: string): Promise<boolean> {
  try {
    const permission = await requestNotificationPermission();

    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return false;
    }

    // Enregistrer la push subscription pour les notifications natives
    const pushSubscription = await registerPushSubscription(userId);
    if (pushSubscription) {
      console.log('Push subscription registered successfully');
    }

    // Garder aussi l'ancien système de tokens pour compatibilité
    const deviceInfo = getDeviceInfo();
    const token = `web-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const { error } = await supabase
      .from('notification_tokens')
      .upsert(
        {
          user_id: userId,
          token: token,
          device_info: deviceInfo,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,token',
        }
      );

    if (error) {
      console.error('Error saving notification token:', error);
    }

    console.log('Notification token registered successfully');
    return true;
  } catch (error) {
    console.error('Error registering notification token:', error);
    return false;
  }
}

async function registerPushSubscription(userId: string): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('Push notifications not supported');
      return false;
    }

    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC;
    console.log('[Push] VAPID key loaded:', vapidPublicKey ? `${vapidPublicKey.substring(0, 20)}...` : 'NOT FOUND');
    
    if (!vapidPublicKey) {
      console.log('VAPID public key not configured');
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    
    // Vérifier si une subscription existe déjà
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      // Créer une nouvelle subscription
      try {
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey.trim());
        console.log('[Push] Converted key length:', convertedVapidKey.length, '(should be 65)');
        
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });
        console.log('New push subscription created');
      } catch (subscribeError) {
        console.error('[Push] Subscribe error:', subscribeError);
        throw subscribeError;
      }
    }

    // Extraire les clés de la subscription
    const subscriptionJson = subscription.toJSON();
    const endpoint = subscription.endpoint;
    const p256dh = subscriptionJson.keys?.p256dh || '';
    const auth = subscriptionJson.keys?.auth || '';

    // Sauvegarder dans Supabase
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint,
          p256dh,
          auth,
          ua: navigator.userAgent,
        },
        {
          onConflict: 'endpoint',
        }
      );

    if (error) {
      console.error('Error saving push subscription:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error registering push subscription:', error);
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getDeviceInfo(): string {
  const info = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
  };
  return JSON.stringify(info);
}

export async function sendLocalNotification(title: string, body: string, data?: any) {
  if (Notification.permission !== 'granted') {
    return;
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data,
        tag: 'party-notification',
      });
    } else {
      new Notification(title, {
        body,
        icon: '/icon-192.png',
        data,
      });
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

export function checkNotificationSupport(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}
