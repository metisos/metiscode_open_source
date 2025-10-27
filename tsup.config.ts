import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "cli/index": "src/cli/index.ts",
  },
  format: ["cjs"],
  sourcemap: true,
  minify: false,
  clean: true,
  outDir: "dist",
});

