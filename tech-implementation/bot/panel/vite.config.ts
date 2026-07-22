import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from /panel by the Deno app (main.ts routes anything under /panel to
// this build's static files), so every asset URL must carry that prefix —
// otherwise a deep link or a refresh resolves assets against "/" and 404s.
export default defineConfig({
  base: "/panel/",
  plugins: [react()],
  server: {
    proxy: {
      // The panel and the bot API are one origin in production. Locally they
      // are two processes, so `npm run dev` needs this to avoid CORS/cookie
      // headaches — the Deno API must be running on :8000 (`deno task dev`
      // in the bot's own directory).
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
