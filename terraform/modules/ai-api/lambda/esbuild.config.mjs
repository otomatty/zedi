/**
 * esbuild 設定 — AI WebSocket Lambda
 *
 * Node.js 22.x ターゲット、ESM 出力、AWS SDK は Lambda ランタイムに含まれるため external。
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.mjs',
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: true,
  sourcemap: true,
  treeShaking: true,
  external: [
    '@aws-sdk/*',
  ],
  banner: {
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
});

console.log('Build complete: dist/index.mjs');
