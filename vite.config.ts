import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@": fileURLToPath(new URL("./src/client", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // No public source maps in production. Set to "hidden" locally if you need
    // to debug a prod build without shipping the .map files.
    sourcemap: false,
    target: "es2020",
  },
  server: {
    port: 5173,
    proxy: {
      // During local dev, the React app runs on Vite (5173) and the Worker API
      // runs on `wrangler dev` (8787). Proxy API + auth cookie routes across.
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
