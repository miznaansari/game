import "./globals.css";

export const metadata = {
  title: "1v1 Battle Grid - Real-time Grid Battleship Arena",
  description: "Challenge your friends to a real-time, 8x8 battleship-like grid prediction game with instant chat and emojis.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Rubik:wght@400;500;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen flex flex-col bg-background text-on-background gaming-pattern">
        {children}
      </body>
    </html>
  );
}


