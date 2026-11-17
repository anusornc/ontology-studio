import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5174",
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 4173,
    strictPort: true
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    globals: true,
    css: false
  }
});
