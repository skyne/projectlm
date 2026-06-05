import { defineConfig } from "vite";

const wsPort = process.env.PORT ?? "8765";

export default defineConfig({
  server: {
    port: Number(process.env.VIEWER_PORT ?? 5173),
    proxy: {
      "/ws": {
        target: `ws://localhost:${wsPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
