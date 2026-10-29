import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the page talks to the real server through the dev server, so
// the browser still sees one origin, as in production.
const API_SERVER = "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/health": API_SERVER,
      "/v1": API_SERVER,
      "/docs": API_SERVER,
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
