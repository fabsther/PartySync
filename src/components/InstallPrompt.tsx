import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-4 shadow-2xl z-50 animate-slide-up">
      <button
        onClick={handleDismiss}
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
          onClick={handleInstall}
          className="bg-white text-orange-600 font-semibold px-4 py-2 rounded-xl hover:bg-orange-50 transition-colors"
        >
          Installer
        </button>
      </div>
    </div>
  );
}
