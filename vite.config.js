import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      "devserver-master--dulcet-granita-3152be.netlify.app",
      ".netlify.app" // Netlify 전체 허용 (권장)
    ]
  }
});
