import { createFileRoute } from "@tanstack/react-router";
import { DriverStepPage } from "@/pages/driver/DriverStepPage";

export const Route = createFileRoute("/driver/step/$stepId")({
  head: () => ({
    meta: [
      { title: "执行步骤 — 司机端" },
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
  component: DriverStepPage,
});
