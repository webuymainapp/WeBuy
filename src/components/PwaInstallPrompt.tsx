import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone, Sparkles } from 'lucide-react';
import { soundEffects } from '../utils/audio';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PwaInstallPrompt: React.FC = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // Chrome would show its own mini-infobar; we show ours.
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (dismissed || !deferred) return null;

  const handleInstall = async () => {
    soundEffects.playSuccessChime();
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') setDeferred(null);
      else setDismissed(true);
    } catch {
      setDismissed(true);
    }
  };

  return (
    <div className="bg-indigo-900 text-white p-3 sm:p-4 rounded-2xl shadow-lg border border-indigo-700/80 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
          <Smartphone className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h4 className="font-bold text-xs sm:text-sm text-white">
              Install Webuy PWA App
            </h4>
            <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.2 rounded-full font-bold uppercase">
              Fast & Offline
            </span>
          </div>
          <p className="text-[11px] text-indigo-200 mt-0.5">
            Instant access to your payment status and textbooks even when offline inside lecture halls.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        <button
          onClick={handleInstall}
          className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-neutral-800 hover:bg-slate-100 dark:hover:bg-neutral-700 text-indigo-900 dark:text-indigo-300 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-indigo-600" />
          <span>Add to Home Screen</span>
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 rounded-lg text-indigo-300 hover:text-white hover:bg-indigo-800 transition-colors"
          aria-label="Close prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};