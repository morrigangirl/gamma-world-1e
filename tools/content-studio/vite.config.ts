import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, "client"),
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    open: true,
    proxy: {
      "/api": "http://127.0.0.1:3737",
      "/api-assets": "http://127.0.0.1:3737"
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist/client"),
    emptyOutDir: true
  }
});
