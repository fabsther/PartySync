import { useState, useEffect } from 'react';
import { Download, X, Bell, Copy, Check } from 'lucide-react';
import { isIOS, isIOSSafari, isStandalone } from '../lib/platform';
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
  const [showIOSNotSafari, setShowIOSNotSafari] = useState(false);
  const [showIOSNotif, setShowIOSNotif] = useState(false);
  const [notifRequesting, setNotifRequesting] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
    // Android / desktop: listen for browser install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowAndroidBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS: show install instructions if not yet installed
    if (isIOS() && !isStandalone()) {
      const dismissed = localStorage.getItem('ios-install-dismissed');
      if (!dismissed) {
        // Only Safari can install a real PWA on iOS — other browsers can only bookmark
        if (isIOSSafari()) {
          setShowIOSInstall(true);
        } else {
          setShowIOSNotSafari(true);
        }
      }
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

  // ── Copy URL (for iOS non-Safari case) ───────────────────────────────────
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.origin).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2500);
    });
  };

  const dismissIOSInstall = () => {
    localStorage.setItem('ios-install-dismissed', 'true');
    setShowIOSInstall(false);
    setShowIOSNotSafari(false);
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

  // ── iOS non-Safari: must use Safari to install ────────────────────────────
  // Chrome/Firefox/Edge on iOS can only add bookmarks — only Safari installs real PWAs
  if (showIOSNotSafari) {
    return (
      <div className="fixed bottom-4 left-4 right-4 bg-neutral-900 border border-orange-500/60 rounded-2xl p-4 shadow-2xl z-50 animate-slide-up">
        <button
          onClick={dismissIOSInstall}
          className="absolute top-2 right-2 p-1 text-neutral-400 hover:text-white"
        >
          <X size={20} />
        </button>

        <div className="flex items-start gap-3 mb-3">
          <div className="text-2xl leading-none mt-0.5">🧭</div>
          <div>
            <h3 className="text-white font-bold">Installer avec Safari</h3>
            <p className="text-neutral-300 text-sm mt-1">
              Sur iOS, seul <strong className="text-white">Safari</strong> peut installer une vraie application.
              Chrome et Firefox n'offrent qu'un simple signet.
            </p>
          </div>
        </div>

        <div className="bg-neutral-800 rounded-xl p-3 mb-3">
          <p className="text-neutral-400 text-xs mb-2">Étapes :</p>
          <ol className="text-neutral-300 text-sm space-y-1">
            <li><span className="text-orange-400 font-bold">1.</span> Copie l'adresse ci-dessous</li>
            <li><span className="text-orange-400 font-bold">2.</span> Ouvre <strong className="text-white">Safari</strong> et colle-la</li>
            <li><span className="text-orange-400 font-bold">3.</span> Appuie sur <strong className="text-white">□↑</strong> → <strong className="text-white">Sur l'écran d'accueil</strong></li>
          </ol>
        </div>

        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0 bg-neutral-800 rounded-lg px-3 py-2 text-neutral-400 text-xs font-mono truncate">
            {window.location.origin}
          </div>
          <button
            onClick={handleCopyUrl}
            className="shrink-0 flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            {urlCopied ? <Check size={16} /> : <Copy size={16} />}
            {urlCopied ? 'Copié !' : 'Copier'}
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
          onClick={dismissIOSInstall}
          className="absolute top-2 right-2 p-1 text-white/80 hover:text-white"
        >
          <X size={20} />
        </button>
        <div className="flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-3 text-white text-2xl leading-none select-none">
            □↑
          </div>
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg">Installer PartySync</h3>
            <p className="text-white/80 text-sm">
              Appuyez sur <span className="font-bold">□↑</span> en bas de Safari,
              puis <span className="font-bold">« Sur l'écran d'accueil »</span>
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
