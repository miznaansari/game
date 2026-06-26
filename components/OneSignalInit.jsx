"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { io } from "socket.io-client";

export default function OneSignalInit({ userId }) {
  const router = useRouter();
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState("standard"); // "standard" or "ios-pwa"
  const [isDismissed, setIsDismissed] = useState(false);
  const [activeNotification, setActiveNotification] = useState(null); // { senderName, content, senderId, isInvite }

  // 1. Global Socket.io initialization & Heartbeat Ping
  useEffect(() => {
    if (!userId) return;

    const socketUrl = (typeof window !== "undefined" && window.location.hostname === "localhost")
      ? "http://localhost:3001"
      : (process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001");
      
    const socket = io(socketUrl, {
      transports: ["websocket"]
    });
    window.globalSocket = socket;

    socket.on("connect", () => {
      console.log("[SOCKET] Connected at root layout");
      socket.emit("user-online", userId);
    });

    socket.on("direct-message-received", (message) => {
      // Dispatch custom window event so currently open chats can receive it instantly
      window.dispatchEvent(new CustomEvent("global-direct-message-received", { detail: message }));

      // Only show top notification if we are NOT actively viewing the sender's chat screen
      const isViewingChat = window.location.pathname === `/chats/${message.senderId}`;
      if (!isViewingChat) {
        const senderName = message.sender?.name || message.sender?.email?.split("@")[0] || "Someone";
        setActiveNotification({
          senderId: message.senderId,
          senderName,
          content: message.isGameInvite ? "Challenged you to a game!" : message.content,
          isInvite: message.isGameInvite
        });
      }
    });

    // Heartbeat ping interval: executes every 15 seconds to ensure online status synchronicity
    const pingInterval = setInterval(() => {
      socket.emit("ping-user", userId);
    }, 15000);

    return () => {
      clearInterval(pingInterval);
      socket.disconnect();
      window.globalSocket = null;
    };
  }, [userId]);

  // Clear top notification after 5 seconds
  useEffect(() => {
    if (!activeNotification) return;
    const timer = setTimeout(() => {
      setActiveNotification(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [activeNotification]);

  // 2. OneSignal PWA Push initialization
  useEffect(() => {
    if (!userId) {
      setShowPrompt(false);
      return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isPWA = window.matchMedia("(display-mode: standalone)").matches || window.navigator?.standalone === true;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "89ccfa0f-7840-4f33-9284-e9d0e44865a9",
        allowLocalhostAsSecureOrigin: true,
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
        } else if (hasPermission) {
          // Native permission is granted, but subscription is not yet fully active.
          // This resolves the Android/Chrome subscription issue by calling optIn programmatically.
          try {
            console.log("[ONESIGNAL] Notification permission already granted. Opting in programmatically...");
            await osInstance.User.PushSubscription.optIn();
            
            const newId = osInstance.User.PushSubscription.id;
            if (newId) {
              await registerPlayerId(newId);
              setShowPrompt(false);
            }
          } catch (err) {
            console.error("[ONESIGNAL] Programmatic optIn failed:", err);
          }
        } else {
          if (isIOS && !isPWA) {
            setPromptType("ios-pwa");
          } else {
            setPromptType("standard");
          }
          
          const dismissed = sessionStorage.getItem("onesignal-prompt-dismissed");
          if (!dismissed) {
            setShowPrompt(true);
          }
        }
      };

      await checkPermissionStatus(OneSignal);
    });
  }, [userId]);

  const handleEnableNotifications = () => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        console.log("[ONESIGNAL] Triggering optIn flow.");
        await OneSignal.User.PushSubscription.optIn();
        
        const currentId = OneSignal.User.PushSubscription.id;
        if (currentId) {
          setShowPrompt(false);
          await registerPlayerId(currentId);
        }
      } catch (err) {
        console.error("[ONESIGNAL] Error requesting permission / opting in:", err);
      }
    });
  };

  const handleDismiss = () => {
    sessionStorage.setItem("onesignal-prompt-dismissed", "true");
    setShowPrompt(false);
    setIsDismissed(true);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUp {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideDown {
          from { transform: translateY(-100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}} />
      
      <Script
        src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
        strategy="afterInteractive"
      />

      {/* Top Middle Real-Time Notification banner */}
      {activeNotification && (
        <div className="fixed top-4 left-0 right-0 z-[10000] flex justify-center px-4 pointer-events-none">
          <div
            onClick={() => {
              router.push(`/chats/${activeNotification.senderId}`);
              setActiveNotification(null);
            }}
            style={{ animation: "slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
            className="pointer-events-auto w-full max-w-sm bg-surface-container-high/95 backdrop-blur-md border border-primary/20 rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-3 cursor-pointer active-scale transition-all hover:bg-surface-container-highest"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">
                  {activeNotification.isInvite ? "sports_esports" : "chat"}
                </span>
              </div>
              <div className="min-w-0">
                <h4 className="font-display font-extrabold text-xs text-on-surface truncate">
                  {activeNotification.isInvite ? "Game Invite Received" : `New Message from ${activeNotification.senderName}`}
                </h4>
                <p className="text-[11px] font-medium text-on-surface-variant truncate mt-0.5">
                  {activeNotification.content}
                </p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveNotification(null);
              }}
              className="w-6 h-6 rounded-full hover:bg-surface-container-highest flex items-center justify-center text-outline hover:text-on-surface transition-colors shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom PWA Push Consent Request */}
      {showPrompt && !isDismissed && (
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
      )}
    </>
  );
}
