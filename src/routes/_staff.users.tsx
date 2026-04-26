import { createFileRoute } from "@tanstack/react-router";
import { UsersPage } from "@/pages/UsersPage";

export const Route = createFileRoute("/_staff/users")({
  head: () => ({ meta: [{ title: "用户管理 — Kennedy Depot" }] }),
  component: UsersPage,
});
