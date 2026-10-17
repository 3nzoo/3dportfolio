import { portfolioHtmlPlugin } from './scripts/lib/portfolio-html.js';
import { defineConfig, loadEnv } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { version } from "./package.json";
import { createInquiryClient } from "./src/contact/inquiries.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_SUPABASE_");
  const url = env.VITE_SUPABASE_URL || "";
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  // Reject elevated keys before Vite can embed them in a browser bundle.
  if ((url || key) && !createInquiryClient({ url, key }).configured) {
    throw new Error("Contact settings require an HTTPS Supabase URL and a publishable (or legacy anon) key. Never use a secret or service_role key.");
  }
  return {
  plugins: [
    portfolioHtmlPlugin(),
    wasm(), // WASM plugin
    topLevelAwait(), // Top-level await support
  ],
  base: "./",
  define: {
    "process.env.VERSION": JSON.stringify(version), // Inject version from package.json
  },
  server: {
    headers: {
      "Cache-Control": "no-cache",
    },
    host: "0.0.0.0",
    port: 5174, // Dev server port
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          rapier: ["@dimforge/rapier3d"],
          three: ["three"],
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Increase chunk size limit
    minify: "esbuild", // Use esbuild minification
  },
  };
});
