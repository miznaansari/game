"use client";

import { useEffect } from "react";
import Script from "next/script";

export default function OneSignalInit({ userId }) {
  useEffect(() => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "89ccfa0f-7840-4f33-9284-e9d0e44865a9",
        allowLocalhostAsSecureOrigin: true, // helps with testing on localhost
      });

      if (userId) {
        console.log("[ONESIGNAL] Logging in external user ID:", userId);
        await OneSignal.login(userId);

        try {
          // Explicitly request notification permission (required on Android Chrome / PWA)
          if (!OneSignal.Notifications.permission) {
            console.log("[ONESIGNAL] Notification permission not granted. Requesting...");
            await OneSignal.Notifications.requestPermission();
          }
        } catch (e) {
          console.warn("[ONESIGNAL] Failed to request notification permission:", e);
        }
      } else {
        console.log("[ONESIGNAL] No user, logging out of subscription");
        await OneSignal.logout();
      }

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
          if (userId) {
            await registerPlayerId(playerId);
          }
        }
      });

      // Check if already subscribed
      const currentId = OneSignal.User.PushSubscription.id;
      if (currentId && userId) {
        await registerPlayerId(currentId);
      }
    });
  }, [userId]);

  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
    />
  );
}
