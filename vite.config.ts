import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitroV2Plugin } from "@tanstack/nitro-v2-vite-plugin";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({
      router: {
        basepath: "/",
        routesDirectory: "routes",
      },
    }),
    nitroV2Plugin({
      preset: "node-server",
    }),
    viteReact(),
    viteTsConfigPaths(),
  ],
  server: {
    port: 3000,
  },
});
