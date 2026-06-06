import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";

const wsPort = process.env.PORT ?? "8765";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function serveConfigs(): Plugin {
  return {
    name: "projectlm-configs",
    configureServer(server) {
      server.middlewares.use("/configs", (req, res, next) => {
        const rel = (req.url ?? "/").split("?")[0];
        const file = path.join(repoRoot, "configs", rel);
        if (!file.startsWith(path.join(repoRoot, "configs"))) return next();
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader("Content-Type", "application/json");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  publicDir: "public",
  plugins: [serveConfigs()],
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
