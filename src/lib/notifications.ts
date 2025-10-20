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

    const token = await generateNotificationToken();

    if (!token) {
      console.log('Failed to generate notification token');
      return false;
    }

    const deviceInfo = getDeviceInfo();

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
      return false;
    }

    console.log('Notification token registered successfully');
    return true;
  } catch (error) {
    console.error('Error registering notification token:', error);
    return false;
  }
}

async function generateNotificationToken(): Promise<string | null> {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;

      if ('pushManager' in registration) {
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          return JSON.stringify(subscription);
        }
      }
    }

    return `web-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  } catch (error) {
    console.error('Error generating notification token:', error);
    return null;
  }
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
