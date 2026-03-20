import { useState, useEffect } from 'react';
import { Download, X, Bell, Copy, Check } from 'lucide-react';
import { isIOS, isIOSSafari, isStandalone } from '../lib/platform';
import { registerNotificationToken } from '../lib/notifications';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface InstallPromptProps {
  userId?: string;
  wasInstalled?: boolean;
}

export function InstallPrompt({ userId, wasInstalled }: InstallPromptProps) {
  // ── Android / desktop: délègue entièrement à usePWAInstall (source unique) ─
  const { canInstall, install } = usePWAInstall();
  const [showAndroidBanner, setShowAndroidBanner] = useState(true);

  // ── iOS banners ───────────────────────────────────────────────────────────
  const [showIOSInstall, setShowIOSInstall] = useState(false);
  const [showIOSNotSafari, setShowIOSNotSafari] = useState(false);
  const [showIOSNotif, setShowIOSNotif] = useState(false);
  const [notifRequesting, setNotifRequesting] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
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
        const t = setTimeout(() => setShowIOSNotif(true), 2500);
        return () => clearTimeout(t);
      }
    }
  }, [userId]);

  // ── Android / desktop handler ─────────────────────────────────────────────
  const handleAndroidInstall = async () => {
    await install(); // usePWAInstall gère le prompt + met canInstall=false si accepté
    // App.tsx capte l'event `appinstalled` et upsert dans app_installs
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

  // Shared top-banner style (just below the nav at 4rem)
  const topStyle = { top: 'calc(4rem + env(safe-area-inset-top))' };

  // ── Android / desktop install banner ──────────────────────────────────────
  if (canInstall && showAndroidBanner) {
    return (
      <div
        className="fixed left-0 right-0 z-30 bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg"
        style={topStyle}
      >
        <button
          onClick={() => setShowAndroidBanner(false)}
          className="absolute top-2 right-2 p-1 text-white/80 hover:text-white"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 px-4 py-3 pr-10">
          <div className="bg-white/20 rounded-lg p-2 shrink-0">
            <Download className="text-white" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            {wasInstalled ? (
              <>
                <p className="text-white font-bold text-sm">📱 Réinstaller l'app ?</p>
                <p className="text-white/80 text-xs">Tu l'avais installée — récupère l'accès rapide.</p>
              </>
            ) : (
              <>
                <p className="text-white font-bold text-sm">Installer PartySync</p>
                <p className="text-white/80 text-xs">Accès rapide depuis l'écran d'accueil</p>
              </>
            )}
          </div>
          <button
            onClick={handleAndroidInstall}
            className="bg-white text-orange-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors text-sm shrink-0"
          >
            Installer
          </button>
        </div>
      </div>
    );
  }

  // ── iOS non-Safari: must use Safari to install ────────────────────────────
  if (showIOSNotSafari) {
    return (
      <div
        className="fixed left-0 right-0 z-30 bg-neutral-900 border-b border-orange-500/60 shadow-lg"
        style={topStyle}
      >
        <button
          onClick={dismissIOSInstall}
          className="absolute top-2 right-2 p-1 text-neutral-400 hover:text-white"
        >
          <X size={18} />
        </button>
        <div className="px-4 py-3 pr-10">
          <div className="flex items-start gap-2 mb-2">
            <span className="text-xl leading-none mt-0.5">🧭</span>
            <div>
              <p className="text-white font-bold text-sm">Installer avec Safari</p>
              <p className="text-neutral-300 text-xs mt-0.5">
                Sur iOS, seul <strong className="text-white">Safari</strong> peut installer une vraie app.
              </p>
            </div>
          </div>
          <ol className="text-neutral-300 text-xs space-y-0.5 mb-2 ml-7">
            <li><span className="text-orange-400 font-bold">1.</span> Copie l'adresse ci-dessous</li>
            <li><span className="text-orange-400 font-bold">2.</span> Ouvre <strong className="text-white">Safari</strong> et colle-la</li>
            <li><span className="text-orange-400 font-bold">3.</span> Appuie sur 📤 → <strong className="text-white">Sur l'écran d'accueil</strong></li>
          </ol>
          <div className="flex gap-2 items-center">
            <div className="flex-1 min-w-0 bg-neutral-800 rounded-lg px-2 py-1.5 text-neutral-400 text-xs font-mono truncate">
              {window.location.origin}
            </div>
            <button
              onClick={handleCopyUrl}
              className="shrink-0 flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {urlCopied ? <Check size={13} /> : <Copy size={13} />}
              {urlCopied ? 'Copié !' : 'Copier'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── iOS "Add to Home Screen" banner ───────────────────────────────────────
  if (showIOSInstall) {
    return (
      <div
        className="fixed left-0 right-0 z-30 bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg"
        style={topStyle}
      >
        <button
          onClick={dismissIOSInstall}
          className="absolute top-2 right-2 p-1 text-white/80 hover:text-white"
        >
          <X size={18} />
        </button>
        <div className="px-4 py-3 pr-10">
          <p className="text-white font-bold text-sm mb-1.5">📲 Installer PartySync</p>
          <ol className="text-white/90 text-xs space-y-1">
            <li>
              <span className="font-bold">1.</span> Dans Safari, appuie sur le bouton Partager 📤
              <span className="text-white/70"> (en bas de l'écran ou dans la barre d'outils)</span>
            </li>
            <li><span className="font-bold">2.</span> Fais défiler la feuille de partage vers le bas</li>
            <li><span className="font-bold">3.</span> Choisis <strong>« Sur l'écran d'accueil »</strong></li>
            <li><span className="font-bold">4.</span> Confirme en appuyant sur <strong>« Ajouter »</strong></li>
          </ol>
          <p className="text-white/60 text-xs mt-1.5">
            iOS 18 : reste appuyé sur la barre d'adresse → <em>Sur l'écran d'accueil</em>
          </p>
        </div>
      </div>
    );
  }

  // ── iOS "Enable Notifications" banner ─────────────────────────────────────
  if (showIOSNotif) {
    return (
      <div
        className="fixed left-0 right-0 z-30 bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg"
        style={topStyle}
      >
        <button
          onClick={() => {
            localStorage.setItem('ios-notif-dismissed', 'true');
            setShowIOSNotif(false);
          }}
          className="absolute top-2 right-2 p-1 text-white/80 hover:text-white"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-3 px-4 py-3 pr-10">
          <div className="bg-white/20 rounded-lg p-2 shrink-0">
            <Bell className="text-white" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm">Activer les notifications</p>
            <p className="text-white/80 text-xs">Recevez des alertes en temps réel</p>
          </div>
          <button
            onClick={handleEnableNotifications}
            disabled={notifRequesting}
            className="bg-white text-orange-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors text-sm shrink-0 disabled:opacity-60"
          >
            {notifRequesting ? '...' : 'Activer'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
