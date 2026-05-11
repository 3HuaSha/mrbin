import { createFileRoute } from "@tanstack/react-router";
import { DriverHomePage } from "@/pages/driver/DriverHomePage";

export const Route = createFileRoute("/driver/")({
  head: () => ({
    meta: [
      { title: "司机端 — Kennedy Depot" },
      { name: "theme-color", content: "#0f172a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Driver" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/icon.svg" },
    ],
  }),
  component: DriverHomePage,
});
