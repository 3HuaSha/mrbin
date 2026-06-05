import { createFileRoute } from "@tanstack/react-router";
import { CementPage } from "@/pages/CementPage";

export const Route = createFileRoute("/_staff/cement")({
  head: () => ({ meta: [{ title: "水泥管理 — Kennedy Depot" }] }),
  component: CementPage,
});
