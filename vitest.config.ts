import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Match the existing application alias when testing the migrated Firebase auth
// helper and client imports. This changes test resolution only.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
})
