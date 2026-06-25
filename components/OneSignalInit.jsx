"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

export default function OneSignalInit({ userId }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState("standard"); // "standard" or "ios-pwa"
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (!userId) {
      setShowPrompt(false);
      return;
    }

    // Client-side detection for iOS and PWA status
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isPWA = window.matchMedia("(display-mode: standalone)").matches || window.navigator?.standalone === true;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "89ccfa0f-7840-4f33-9284-e9d0e44865a9",
        allowLocalhostAsSecureOrigin: true, // helps with testing on localhost
      });

      console.log("[ONESIGNAL] Logging in external user ID:", userId);
      await OneSignal.login(userId);

      const registerPlayerId = async (id) => {
        if (!id) return;
        try {
          await fetch("/api/user/onesignal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId: id }),
          });
          console.log("Registered OneSignal Player ID:", id);
        } catch (err) {
          console.error("Failed to save player ID to server:", err);
        }
      };

      // Handle subscription state changes
      OneSignal.User.PushSubscription.addEventListener("change", async (event) => {
        if (event.current.token) {
          const playerId = OneSignal.User.PushSubscription.id;
          await registerPlayerId(playerId);
          setShowPrompt(false);
        } else {
          checkPermissionStatus(OneSignal);
        }
      });

      const checkPermissionStatus = async (osInstance) => {
        const hasPermission = osInstance.Notifications.permission;
        const currentId = osInstance.User.PushSubscription.id;
        
        if (hasPermission && currentId) {
          await registerPlayerId(currentId);
          setShowPrompt(false);
        } else {
          // If no permission or not subscribed
          if (isIOS && !isPWA) {
            setPromptType("ios-pwa");
          } else {
            setPromptType("standard");
          }
          
          // Only show if not dismissed in this session
          const dismissed = sessionStorage.getItem("onesignal-prompt-dismissed");
          if (!dismissed) {
            setShowPrompt(true);
          }
        }
      };

      // Check current permission status immediately on load
      await checkPermissionStatus(OneSignal);
    });
  }, [userId]);

  const handleEnableNotifications = () => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        console.log("[ONESIGNAL] User triggered permission request.");
        const granted = await OneSignal.Notifications.requestPermission();
        if (granted) {
          setShowPrompt(false);
          const currentId = OneSignal.User.PushSubscription.id;
          if (currentId && userId) {
            await fetch("/api/user/onesignal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ playerId: currentId }),
            });
          }
        }
      } catch (err) {
        console.error("[ONESIGNAL] Error requesting permission:", err);
      }
    });
  };

  const handleDismiss = () => {
    sessionStorage.setItem("onesignal-prompt-dismissed", "true");
    setShowPrompt(false);
    setIsDismissed(true);
  };

  if (!userId || !showPrompt || isDismissed) {
    return (
      <Script
        src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
        strategy="afterInteractive"
      />
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUp {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}} />
      <Script
        src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
        strategy="afterInteractive"
      />
      <div 
        style={{ animation: "slideUp 0.3s ease-out forwards" }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 z-[9999] max-w-md bg-surface-container-high/95 backdrop-blur-md border border-outline-variant/30 rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined font-bold text-2xl">notifications_active</span>
            </div>
            <div>
              <h3 className="font-display font-extrabold text-sm text-on-surface">
                {promptType === "ios-pwa" ? "Add to Home Screen" : "Enable Push Notifications"}
              </h3>
              <p className="text-[11px] font-bold text-outline mt-0.5">
                {promptType === "ios-pwa"
                  ? "Required to receive live game invites and friend requests on iOS."
                  : "Never miss a game invite, friend request, or chat reaction!"}
              </p>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="w-6 h-6 rounded-full hover:bg-surface-container-highest flex items-center justify-center text-outline hover:text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {promptType === "ios-pwa" ? (
          <div className="text-[11px] leading-relaxed text-on-surface-variant bg-surface-container-lowest/50 border border-outline-variant/20 rounded-xl p-3">
            <p className="font-bold flex items-center gap-1.5 mb-1 text-primary">
              <span className="material-symbols-outlined text-sm">info</span> Setup Steps:
            </p>
            <ol className="list-decimal list-inside space-y-1 font-bold text-outline">
              <li>Tap the <strong className="text-on-surface">Share</strong> button 📤 in Safari.</li>
              <li>Select <strong className="text-on-surface">"Add to Home Screen"</strong> ➕.</li>
              <li>Open the installed app and enable notifications!</li>
            </ol>
          </div>
        ) : (
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={handleEnableNotifications}
              className="flex-1 glossy-primary py-2.5 rounded-xl text-white font-bold text-xs cursor-pointer shadow-sm hover:shadow-md transition-all active-scale text-center"
            >
              Enable Notifications
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 bg-surface-container hover:bg-surface-container-high py-2.5 rounded-xl text-outline hover:text-on-surface border border-outline-variant/30 font-bold text-xs cursor-pointer transition-all active-scale text-center"
            >
              Maybe Later
            </button>
          </div>
        )}
      </div>
    </>
  );
}
