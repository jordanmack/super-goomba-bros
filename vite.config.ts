import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: [
      {
        find: /^phaser$/,
        replacement: fileURLToPath(
          new URL(
            "./node_modules/phaser/dist/phaser-arcade-physics.js",
            import.meta.url,
          ),
        ),
      },
    ],
  },
});
