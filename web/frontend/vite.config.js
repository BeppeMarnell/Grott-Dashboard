import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Built bundle is served by Flask from web/frontend/dist at the site root.
// In dev (`npm run dev`), /api is proxied to the Flask backend on :8088.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    proxy: { "/api": "http://localhost:8088" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
