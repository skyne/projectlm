import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, "../..");
const apiPort = Number(process.env.TRACK_EDITOR_API_PORT ?? 5191);

export default defineConfig({
  resolve: {
    alias: {
      "@viewer": path.join(repoRoot, "viewer/src"),
      "@server": path.join(repoRoot, "server/src"),
    },
  },
  server: {
    port: Number(process.env.TRACK_EDITOR_PORT ?? 5190),
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
