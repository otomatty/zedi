import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/index.mjs",
  platform: "node",
  target: "node20",
  format: "esm",
  minify: true,
  sourcemap: true,
  external: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/client-rds-data",
    "@aws-sdk/client-secrets-manager",
  ],
  banner: {
    // Needed for ESM Lambda with __dirname support
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
});

console.log("Build complete: dist/index.mjs");
