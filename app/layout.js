import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import OneSignalInit from "@/components/OneSignalInit";

export const metadata = {
  title: "1v1 Battle Grid - Real-time Grid Battleship Arena",
  description: "Challenge your friends to a real-time, 8x8 battleship-like grid prediction game with instant chat and emojis.",
};

export default async function RootLayout({ children }) {
  const user = await getSessionUser();

  return (
    <html lang="en" className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Rubik:wght@400;500;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered', reg))
                .catch(err => console.log('Service Worker registration failed', err));
            });
          }
          window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            window.deferredPrompt = e;
            window.dispatchEvent(new CustomEvent('pwa-installable'));
          });
        `}} />
      </head>
      <body className="min-h-screen flex flex-col bg-background text-on-background gaming-pattern">
        <OneSignalInit userId={user?.id || null} />
        {children}
      </body>
    </html>
  );
}


