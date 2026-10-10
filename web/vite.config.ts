/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/; the workflow sets VITE_BASE.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  worker: { format: "es" },
  // Pyodide locates its own wasm/stdlib files at runtime; do not pre-bundle it.
  optimizeDeps: { exclude: ["pyodide"] },
  server: {
    port: 5173,
    // Only used with VITE_ENGINE=http: the Python API runs on :8000.
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    css: false,
    exclude: ["node_modules", "dist"],
  },
});
