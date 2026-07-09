import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The web is a SEPARATE repo from the @epm/api backend. In dev we proxy the API and the
// OIDC auth routes to the backend (default http://localhost:3000) so the browser sees a
// single origin — the httpOnly session cookies (epm_access/epm_refresh) then ride along
// on same-origin requests without CORS/SameSite friction. Override the target with
// VITE_API_TARGET if the backend runs elsewhere.
const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/auth": { target: API_TARGET, changeOrigin: true },
      "/health": { target: API_TARGET, changeOrigin: true },
    },
  },
});
