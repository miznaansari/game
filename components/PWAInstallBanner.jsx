"use client";

import { useEffect, useState } from "react";

export default function PWAInstallBanner() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 1. Check if already running in standalone mode (i.e. installed)
    const isStandalone = 
      window.matchMedia("(display-mode: standalone)").matches || 
      window.navigator.standalone === true;

    if (isStandalone) return;

    // 2. Check if dismissed previously
    const isDismissed = localStorage.getItem("pwa-prompt-dismissed") === "true";
    if (isDismissed) return;

    // 3. Detect iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    if (isIOS) {
      setShowIOSPrompt(true);
      return;
    }

    // 4. For Android/Chrome/PC: Check if beforeinstallprompt already fired
    if (window.deferredPrompt) {
      setInstallPrompt(window.deferredPrompt);
      setShowAndroidPrompt(true);
    }

    // Listen for custom 'pwa-installable' event
    const handleInstallable = () => {
      if (window.deferredPrompt) {
        setInstallPrompt(window.deferredPrompt);
        setShowAndroidPrompt(true);
      }
    };

    window.addEventListener("pwa-installable", handleInstallable);
    return () => {
      window.removeEventListener("pwa-installable", handleInstallable);
    };
  }, []);

  const handleAndroidInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    setInstallPrompt(null);
    setShowAndroidPrompt(false);
    window.deferredPrompt = null;
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-prompt-dismissed", "true");
    setDismissed(true);
  };

  if (dismissed) return null;

  if (showAndroidPrompt) {
    return (
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-2xl p-4 mb-4 flex items-center justify-between gap-4 card-shadow animate-float">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[24px]">install_mobile</span>
          </div>
          <div>
            <h4 className="font-display font-extrabold text-sm text-on-background">Add to Home Screen</h4>
            <p className="text-[10px] text-on-surface-variant font-semibold mt-0.5">
              Install 1v1 Battle Grid on your device for instant matching and full-screen gameplay.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button 
            onClick={handleDismiss}
            className="w-8 h-8 rounded-xl bg-surface-container text-on-surface-variant border border-outline-variant/30 flex items-center justify-center font-bold active-scale cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
          <button 
            onClick={handleAndroidInstall}
            className="bg-primary text-white text-xs font-bold px-3.5 py-2 rounded-xl active-scale cursor-pointer shadow-sm hover:shadow-md transition-shadow"
          >
            Install
          </button>
        </div>
      </div>
    );
  }

  if (showIOSPrompt) {
    return (
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-2xl p-4 mb-4 flex flex-col gap-3 card-shadow animate-float">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[24px]">phonelink_setup</span>
            </div>
            <div>
              <h4 className="font-display font-extrabold text-sm text-on-background">Add to Home Screen</h4>
              <p className="text-[10px] text-on-surface-variant font-semibold mt-0.5">
                Install on your iPhone or iPad for a full-screen battle experience.
              </p>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="w-8 h-8 rounded-xl bg-surface-container text-on-surface-variant border border-outline-variant/30 flex items-center justify-center font-bold active-scale cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
        <div className="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl text-[10px] font-semibold text-on-surface-variant flex items-center flex-wrap gap-1.5 border border-outline-variant/10">
          <span>Tap the share icon</span>
          <span className="material-symbols-outlined text-[14px] text-primary">share</span>
          <span>in Safari, scroll down, and select</span>
          <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">Add to Home Screen</span>
          <span>📱</span>
        </div>
      </div>
    );
  }

  return null;
}
