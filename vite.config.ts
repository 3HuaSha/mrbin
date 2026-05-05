// Using @lovable.dev/vite-tanstack-config which correctly handles
// the TanStack Start + vinxi + nitro wiring with node-server preset.
// The Lovable npm package is just a config helper — it is NOT Cloudflare-specific.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    nitro: {
      preset: "node-server",
    },
  },
});
