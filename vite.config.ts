import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { createCodexBridgeMiddleware } from "./src/server/codexAppServerBridge";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode } = { mode: "development" }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const publicBaseUrl = env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL;

  return {
    server: {
      port: 5173,
      allowedHosts: true,
    },
    plugins: [
      vue(),
      tailwindcss(),
      {
        name: "codex-bridge",
        configureServer(server) {
          const bridge = createCodexBridgeMiddleware({
            publicBaseUrl,
          });
          server.middlewares.use(bridge);
          server.httpServer?.once("close", () => {
            bridge.dispose();
          });
        },
      },
    ],
  };
});
