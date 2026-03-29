/* eslint-disable jsdoc/require-jsdoc -- Vite config locals are self-explanatory; per-const JSDoc would be noise. */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = parseInt(env.VITE_PORT || "30001", 10);
  const apiTarget = env.ZEDI_API_PROXY_TARGET || "";
  const apiTargetIsLocal = (() => {
    if (!apiTarget) return false;
    try {
      const { hostname, protocol } = new URL(apiTarget);
      return (
        protocol === "http:" ||
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1"
      );
    } catch {
      return false;
    }
  })();

  return {
    server: {
      host: "::",
      port,
      strictPort: false,
      ...(apiTarget
        ? {
            proxy: {
              "/api": {
                target: apiTarget,
                changeOrigin: true,
                secure: !apiTargetIsLocal,
              },
            },
          }
        : {}),
    },
    build: {
      outDir: "dist",
      target: "esnext",
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
