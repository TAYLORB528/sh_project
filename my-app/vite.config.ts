import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/ws": {
        target: "ws://ws-server:3001",
        ws: true,
        rewriteWsOrigin: true,
      },
      "/api": {
        target: "http://ws-server:3001",
        changeOrigin: true,
      },
    },
  },
});
