import { useState, useEffect } from 'react';
import { Download, X, Bell } from 'lucide-react';
import { isIOS, isStandalone } from '../lib/platform';
import { registerNotificationToken } from '../lib/notifications';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptProps {
  userId?: string;
}

export function InstallPrompt({ userId }: InstallPromptProps) {
  // ── Android / desktop install prompt ─────────────────────────────────────
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidBanner, setShowAndroidBanner] = useState(false);

  // ── iOS banners ───────────────────────────────────────────────────────────
  const [showIOSInstall, setShowIOSInstall] = useState(false);
  const [showIOSNotif, setShowIOSNotif] = useState(false);
  const [notifRequesting, setNotifRequesting] = useState(false);

  useEffect(() => {
    // Android / desktop: listen for browser install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowAndroidBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS: show "Add to Home Screen" banner if not yet installed
    if (isIOS() && !isStandalone()) {
      const dismissed = localStorage.getItem('ios-install-dismissed');
      if (!dismissed) setShowIOSInstall(true);
    }

    // iOS standalone: show "Enable Notifications" banner if not yet granted
    if (isIOS() && isStandalone() && userId) {
      const dismissed = localStorage.getItem('ios-notif-dismissed');
      const permission = 'Notification' in window ? Notification.permission : 'denied';
      if (!dismissed && permission === 'default') {
        // Small delay so it doesn't flash on screen instantly
        const t = setTimeout(() => setShowIOSNotif(true), 2500);
        return () => {
          clearTimeout(t);
          window.removeEventListener('beforeinstallprompt', handler);
        };
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [userId]);

  // ── Android / desktop handlers ────────────────────────────────────────────
  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShowAndroidBanner(false);
    setDeferredPrompt(null);
  };

  // ── iOS notification handler (must be called from user gesture) ───────────
  const handleEnableNotifications = async () => {
    if (!userId || notifRequesting) return;
    setNotifRequesting(true);
    try {
      const success = await registerNotificationToken(userId);
      if (success || Notification.permission === 'granted') {
        localStorage.setItem('ios-notif-dismissed', 'true');
        setShowIOSNotif(false);
      }
    } finally {
      setNotifRequesting(false);
    }
  };

  // ── Android banner ────────────────────────────────────────────────────────
  if (showAndroidBanner) {
    return (
      <div className="fixed bottom-4 left-4 right-4 bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-4 shadow-2xl z-50 animate-slide-up">
        <button
          onClick={() => setShowAndroidBanner(false)}
          className="absolute top-2 right-2 p-1 text-white/80 hover:text-white"
        >
          <X size={20} />
        </button>
        <div className="flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-3">
            <Download className="text-white" size={28} />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg">Installer PartySync</h3>
            <p className="text-white/80 text-sm">Accès rapide depuis votre écran d'accueil</p>
          </div>
          <button
            onClick={handleAndroidInstall}
            className="bg-white text-orange-600 font-semibold px-4 py-2 rounded-xl hover:bg-orange-50 transition-colors"
          >
            Installer
          </button>
        </div>
      </div>
    );
  }

  // ── iOS "Add to Home Screen" banner ───────────────────────────────────────
  if (showIOSInstall) {
    return (
      <div className="fixed bottom-4 left-4 right-4 bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-4 shadow-2xl z-50 animate-slide-up">
        <button
          onClick={() => {
            localStorage.setItem('ios-install-dismissed', 'true');
            setShowIOSInstall(false);
          }}
          className="absolute top-2 right-2 p-1 text-white/80 hover:text-white"
        >
          <X size={20} />
        </button>
        <div className="flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-3 text-white text-2xl leading-none select-none">
            ↑
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg">Installer PartySync</h3>
            <p className="text-white/80 text-sm">
              Appuyez sur <span className="font-bold">□↑</span> puis{' '}
              <span className="font-bold">« Sur l'écran d'accueil »</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── iOS "Enable Notifications" banner ─────────────────────────────────────
  if (showIOSNotif) {
    return (
      <div className="fixed bottom-4 left-4 right-4 bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-4 shadow-2xl z-50 animate-slide-up">
        <button
          onClick={() => {
            localStorage.setItem('ios-notif-dismissed', 'true');
            setShowIOSNotif(false);
          }}
          className="absolute top-2 right-2 p-1 text-white/80 hover:text-white"
        >
          <X size={20} />
        </button>
        <div className="flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-3">
            <Bell className="text-white" size={28} />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg">Activer les notifications</h3>
            <p className="text-white/80 text-sm">Recevez des alertes en temps réel</p>
          </div>
          <button
            onClick={handleEnableNotifications}
            disabled={notifRequesting}
            className="bg-white text-orange-600 font-semibold px-4 py-2 rounded-xl hover:bg-orange-50 transition-colors disabled:opacity-60"
          >
            {notifRequesting ? '...' : 'Activer'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
