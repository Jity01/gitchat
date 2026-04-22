import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. Only watch files Vite actually serves. Anything else (the user's
      // working-directory files, SPEC.md, Cargo target dirs, logs, etc.) must
      // NOT trigger an HMR reload — gitchat's own file editor will write to
      // disk, and if Vite reacts to those writes by reloading the webview,
      // the app snaps back to its initial DEMO_CHATS state. That's what was
      // causing the "flash back to home page" during file editing.
      //
      // Negated (`!`) globs opt *in*; everything else is ignored.
      ignored: [
        "**/src-tauri/**",
        "**/target/**",
        "**/node_modules/**",
        "**/dist/**",
        "**/.git/**",
        (path: string) => {
          // Permit: files inside src/, public/, index.html, vite.config.ts,
          // tsconfig*.json, package.json, and the node_modules resolution.
          const norm = path.replace(/\\/g, "/");
          if (norm.endsWith("/index.html")) return false;
          if (norm.endsWith("/vite.config.ts")) return false;
          if (norm.endsWith("/package.json")) return false;
          if (/\/tsconfig[^/]*\.json$/.test(norm)) return false;
          if (norm.includes("/src/")) return false;
          if (norm.includes("/public/")) return false;
          // Anything else inside the project root — ignore.
          return true;
        },
      ],
    },
  },
}));
