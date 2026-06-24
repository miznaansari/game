export default function manifest() {
  return {
    name: "1v1 Battle Grid",
    short_name: "BattleGrid",
    description: "Challenge your friends to a real-time, 8x8 battleship-like grid prediction game.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  };
}
