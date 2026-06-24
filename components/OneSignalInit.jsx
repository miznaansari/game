"use client";

import { useEffect } from "react";
import Script from "next/script";

export default function OneSignalInit({ userId }) {
  useEffect(() => {
    if (!userId) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "89ccfa0f-7840-4f33-9284-e9d0e44865a9",
        allowLocalhostAsSecureOrigin: true, // helps with testing on localhost
      });

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
        }
      });

      // Check if already subscribed
      const currentId = OneSignal.User.PushSubscription.id;
      if (currentId) {
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
