import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AstroXL",
    short_name: "AstroXL",
    description: "Your personal astrological predictions.",
    start_url: "/",
    display: "standalone",       // makes it open like a real app (no browser chrome)
    background_color: "#050816",
    theme_color: "#050816",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}