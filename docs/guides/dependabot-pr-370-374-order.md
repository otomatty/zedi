# Dependabot PR 370〜374 の取り込み順序

<!-- 日本語 / English -->

## 概要

| PR      | 対象           | 変更内容                               | 備考                           |
| ------- | -------------- | -------------------------------------- | ------------------------------ |
| **370** | `server/api`   | jsdom 28.1.0 → 29.0.0                  | 本番依存（deps）               |
| **371** | root (develop) | vite 5.4.21 → **8.0.0**                | メジャーアップ、rolldown 統合  |
| **372** | root (develop) | @vitejs/plugin-react 5.2.0 → **6.0.1** | **Vite 8+ 前提**               |
| **373** | root (develop) | jsdom 26.1.0 → 29.0.0                  | 開発依存（deps-dev、テスト用） |
| **374** | root (develop) | @types/node 24.12.0 → 25.5.0           | 型定義のみ                     |

## 推奨取り込み順序

### 1. **PR 371**（vite 8.0.0）を最初にマージ

- **理由**: Vite 8 はメジャーアップで、rolldown 統合・デフォルトブラウザターゲット変更・`import.meta.hot.accept` の挙動変更など破壊的変更がある。
- **対応**: マージ後に [Vite 8 Migration Guide](https://vite.dev/guide/migration.html) を確認し、`vite.config.*` やスクリプトの修正が必要なら対応する。
- **確認**: `bun run build` / `bun run dev` でビルド・開発サーバーが動くことを確認。

### 2. **PR 372**（@vitejs/plugin-react 6.0.1）を 2 番目にマージ

- **理由**: plugin-react 6.x は **Vite 8+ 向け**（React Refresh を Oxc で処理するため Babel を削除）。371 で Vite 8 を取り込んだ後にマージする必要がある。
- **注意**: Babel オプション（`babel: { plugins: [...] }`）を使っている場合は、[CHANGELOG](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/CHANGELOG.md) の通り `@rolldown/plugin-babel` を別途使う形に移行する必要がある。
- **確認**: フロントのビルド・HMR が問題ないことを確認。

### 3. **PR 370**（server/api の jsdom 29.0.0）を 3 番目にマージ

- **理由**: `server/api` のみの変更で、root の lockfile や他 PR と競合しにくい。
- **注意**: jsdom 29 は Node.js v22 では v22.13.0+ が必須。`engines` は `>=24.0.0` なので通常は問題ない。
- **確認**: `server/api` のテスト・関連スクリプトが通ることを確認。

### 4. **PR 373**（root の jsdom 29.0.0）を 4 番目にマージ

- **理由**: ルートの開発依存（Vitest 等の DOM 環境用）。370 と同様の jsdom 29 なので、370 の確認が済んでいればリスクは低い。
- **確認**: `bun run test:run` が通ることを確認。

### 5. **PR 374**（@types/node 25.5.0）を最後にマージ

- **理由**: 型定義のみの変更。Vite 8 や jsdom 29 を取り込んだ状態で型を合わせた方が、Node 系の型不整合が出にくい。
- **確認**: `bun run lint` および TypeScript の型チェックが通ることを確認。

---

## 手順まとめ（コマンド例）

```bash
# 1. develop を最新に
git fetch origin develop && git checkout develop && git pull origin develop

# 2. PR 371 をマージ（GitHub でマージ or gh pr merge 371）
# 3. develop を pull
# 4. PR 372 をマージ
# 5. 同様に 370 → 373 → 374 を順にマージ

# 各マージ後に推奨確認
bun install
bun run lint
bun run format:check
bun run test:run
bun run build
# server/api のテスト（370 マージ後）
cd server/api && bun run test:run && cd ../..
```

## まとめてマージする場合の注意

- **371 と 372 は必ずこの順**（372 は 371 に依存）。
- **370 と 373** はどちらを先にしてもよいが、別ワークスペースなので 370 → 373 の方が「server を先にそろえる」として分かりやすい。
- **374** は最後が無難（型の影響を一括で確認できる）。

## 参考リンク

- [Vite 8.0 announcement & migration](https://vite.dev/guide/migration.html)
- [@vitejs/plugin-react 6.0 CHANGELOG](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/CHANGELOG.md)
- [jsdom 29.0.0 release notes](https://github.com/jsdom/jsdom/releases/tag/v29.0.0)
