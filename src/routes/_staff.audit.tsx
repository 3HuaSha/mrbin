import { createFileRoute } from "@tanstack/react-router";
import { AuditLogsPage } from "@/pages/AuditLogsPage";

export const Route = createFileRoute("/_staff/audit")({
  head: () => ({ meta: [{ title: "审计日志 — Kennedy Depot" }] }),
  component: AuditLogsPage,
});
