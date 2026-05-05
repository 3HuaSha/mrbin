import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({
      router: {
        basepath: "/",
        routesDirectory: "routes",
      },
      client: {
        base: "/assets",
      },
    }),
    viteReact(),
    viteTsConfigPaths(),
  ],
  css: {
    postcss: './postcss.config.js',
  },
  server: {
    port: 3000,
  },
});
