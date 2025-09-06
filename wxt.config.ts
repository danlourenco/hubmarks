import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { homedir } from "os";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["bookmarks", "storage", "alarms"],
    host_permissions: ["https://api.github.com/*"],
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; worker-src 'self'",
    },
  },
  webExt: {
    chromiumArgs: ["--user-data-dir=./.wxt/chrome-data"],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
