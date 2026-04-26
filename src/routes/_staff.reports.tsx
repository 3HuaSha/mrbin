import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/pages/ReportsPage";

export const Route = createFileRoute("/_staff/reports")({
  head: () => ({ meta: [{ title: "运营报表 — Kennedy Depot" }] }),
  component: ReportsPage,
});
