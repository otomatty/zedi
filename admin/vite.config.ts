import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = parseInt(env.VITE_PORT || "30001", 10);
  const apiTarget = env.ZEDI_API_PROXY_TARGET || "";

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
                secure: true,
              },
            },
          }
        : {}),
    },
    build: {
      outDir: "dist",
      target: "esnext",
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
