import { createFileRoute } from "@tanstack/react-router";
import { DriverLoginPage } from "@/pages/driver/DriverLoginPage";

export const Route = createFileRoute("/driver/login")({
  head: () => ({
    meta: [
      { title: "登录 — 司机端" },
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
  component: DriverLoginPage,
});
