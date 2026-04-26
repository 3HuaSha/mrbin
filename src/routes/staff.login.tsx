import { createFileRoute } from "@tanstack/react-router";
import { StaffLoginPage } from "@/pages/StaffLoginPage";

export const Route = createFileRoute("/staff/login")({
  head: () => ({ meta: [{ title: "调度后台登录 — Kennedy Depot" }] }),
  component: StaffLoginPage,
});
