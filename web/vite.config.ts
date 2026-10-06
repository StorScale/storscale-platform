import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` sends sign-in and the API to a platformd (PLATFORMD_URL).
const platformd = process.env.PLATFORMD_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": platformd, "/auth": platformd } },
  build: { outDir: "dist", sourcemap: false },
});
