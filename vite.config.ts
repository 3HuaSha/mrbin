import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitropack/vite";
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
    nitro(),
    viteReact(),
    viteTsConfigPaths(),
  ],
  server: {
    port: 3000,
  },
});
