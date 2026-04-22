import { defineConfig } from "vitest/config";
import path from "node:path";

// .test.ts → node, .test.tsx → jsdom. Default stays node so anything
// without an explicit match (scripts, plain helpers) doesn't get pushed
// into a browser env unnecessarily.
//
// NOTE: environmentMatchGlobs is deprecated in Vitest v3 in favour of the
// `projects` config. Repo is on v2.1.x; migrate when bumping major.

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  },
  // tsconfig has jsx:"preserve" (Next handles transform). Vitest's esbuild
  // needs to be told to emit React's automatic runtime so .tsx tests don't
  // need an explicit `import React from "react"`.
  esbuild: {
    jsx: "automatic"
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [
      ["**/*.test.tsx", "jsdom"],
      ["**/*.test.ts", "node"]
    ],
    setupFiles: ["./vitest.setup.ts"],
    globals: false,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"]
  }
});
