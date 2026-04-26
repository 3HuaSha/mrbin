import { createFileRoute } from "@tanstack/react-router";
import { FleetMapPage } from "@/pages/FleetMapPage";

export const Route = createFileRoute("/_staff/map")({
  head: () => ({ meta: [{ title: "实时车队地图 — Kennedy Depot" }] }),
  component: FleetMapPage,
});
