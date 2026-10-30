> **言語:** [English](README.md) | 日本語

# PoC: hono/jsx/dom による Zedi フロントエンド

Zedi を一から作り直す前提で、**フロントからバックエンドまで Hono だけ**で組めるか、重い画面で性能が出るかを確かめる PoC です。既存データとの互換は考慮していません。

## 構成

Cloudflare Worker 1 本ですべてを配信します（`wrangler.jsonc`）。

| パス                     | 中身                                            | 技術                                                                                                   |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/`                      | 公開ページ（JS なし）                           | Worker 上で `hono/jsx` によるサーバー描画（`src/worker/landing.tsx`）                                  |
| `/api/*`                 | ノート一覧・詳細、疑似 AI ストリーミング（SSE） | Hono（`src/worker/app.tsx`）。ノートはメモリ上のダミー 10,000 件（D1 の代役）                          |
| `/parties/page-room/:id` | 共同編集                                        | ページごとの Durable Object（`PageRoom`、y-partyserver、WebSocket Hibernation、DO 内蔵 SQLite に保存） |
| それ以外                 | アプリ本体の SPA                                | `hono/jsx/dom`（`src/client/`）。Static Assets として配信                                              |

アプリ本体（`src/client/`）で使っている外部ライブラリは、すべてフレームワーク非依存のものです。

- `@tanstack/query-core` / `@tanstack/virtual-core`: それぞれ薄いフックで包んでいます（`lib/query.ts` 48 行、`lib/virtual.ts` 36 行）
- `@floating-ui/dom`
- Tiptap 3 本体（React バインディングは使わない）+ Y.js + `y-partyserver/provider`

ルーター（`lib/router.ts` 115 行）、遅延読み込み（`lib/lazy.tsx` 19 行）、コマンドパレット（`ui/CommandPalette.tsx`、ネイティブ `<dialog>` + ARIA の combobox/listbox パターン）は自作です。UI ライブラリは使っていません。

## 実装した機能

- 10,000 件のノート一覧（仮想スクロール）
- `⌘K` / `Ctrl+K` のコマンドパレット
- 共同編集エディタ（遅延チャンク）
  - `[[` で WikiLink 候補 → ノードビューを `hono/jsx/dom` で描画
  - `/` でスラッシュコマンド
  - `#タグ` + スペースでタグ
  - 複数人のカーソル表示
- AI 応答のストリーミング表示。描画方式を 3 種類用意しています（後述）
- 画面をまたいで残るアプリシェル（サイドバーとパレット）

**対象外**: 認証、D1、実際の LLM 呼び出し、Markdown 描画、i18n、オフライン（IndexedDB）、Tauri。

## コマンド

```bash
bun install
bun run test          # Vitest（59 件。hono/jsx/dom コンポーネントも happy-dom + Testing Library で検証）
bun run typecheck     # クライアント（hono/jsx/dom）とワーカー（hono/jsx）を別々に型チェック
bun run build         # SPA を dist/client にビルド
bun run dev:worker    # wrangler dev（http://127.0.0.1:8787）
bun run smoke         # ブラウザで主要機能を確認（build 済みが前提）
bun run bundle:report # バンドルサイズ → results/bundle.json
bun run measure       # 実行時性能 → results/measurements.json
```

`smoke` と `measure` は Playwright と Chromium を使います。Playwright のバージョンに対応するブラウザがない場合は、`CHROMIUM_PATH` で既存の Chromium を指定できます。

## 計測結果（2026-10-30）

計測環境: コンテナ上のヘッドレス Chromium + ローカルの workerd（`wrangler dev`）。ネットワーク遅延は含みません。「4x」は CDP の CPU スロットリング（中位のモバイル端末相当の目安）です。生データは `results/` にあります。

### バンドル

|                                                                   | raw      | gzip        | brotli   |
| ----------------------------------------------------------------- | -------- | ----------- | -------- |
| **初期ロード JS**（シェル・ルーター・一覧・パレット・データ取得） | 85.1 KB  | **27.5 KB** | 24.6 KB  |
| エディタ（遅延: Tiptap + ProseMirror + Y.js + プロバイダ）        | 541.5 KB | 170.7 KB    | 145.2 KB |
| AI チャット（遅延）                                               | 3.0 KB   | 1.6 KB      | 1.4 KB   |

参考として、現行の React 版は初期ロード JS が 4.46 MB raw / 1.31 MB gzip です（同日に `vite build` で計測）。機能範囲が違うので単純比較はできませんが、シェルと主要画面の土台は gzip 30KB 未満に収まりました。

### 実行時性能

| シナリオ                                                     | 1x                     | 4x                     |
| ------------------------------------------------------------ | ---------------------- | ---------------------- |
| ノート一覧の初回描画（10,000 件・約 2MB の JSON 取得を含む） | 253 ms                 | 632 ms                 |
| 一覧のスクロール（DOM 上は 19 行）                           | 58.7 fps・長いタスク 0 | 56.9 fps・長いタスク 0 |
| JS ヒープ（一覧表示後）                                      | 9.5 MB                 | 9.4 MB                 |
| エディタ表示まで（遅延チャンク読み込み + DO 同期）           | 283 ms                 | 929 ms                 |
| 入力遅延（keydown → 次フレーム、空の文書）p50 / p95          | 4.6 / 17.9 ms          | 22.4 / 39.1 ms         |
| 入力遅延（2,000 段落、共同編集あり）p50 / p95                | 13.6 / 21.3 ms         | 107 / 184 ms           |
| 入力遅延（2,000 段落、共同編集なし）p50 / p95                | 10.9 / 18.9 ms         | 47.3 / 78.5 ms         |
| 2 画面間の反映（ローカル）p50 / p95                          | 33 / 52 ms             | 99 / 292 ms            |
| AI 2,000 トークン（state / direct / blocks）                 | 60 / 60 / 60 fps       | 45 / 50 / 58 fps       |
| AI 10,000 トークン（state / direct / blocks）                | 57 / 57 / 60 fps       | **21 / 24 / 58 fps**   |

AI ストリーミングの描画方式:

- `state`: トークンごとに `useState` を更新して再描画する
- `direct`: 1 つの Text ノードにフレームごとに追記する
- `blocks`: フレームごとに追記し、段落ごとに別ブロックへ分ける

## わかったこと

1. **`hono/jsx/dom` はどのシナリオでもボトルネックになりませんでした。** 4x でも一覧のスクロールは 57fps を保ち、空の文書での入力遅延は 1x で p50 4.6ms でした。
2. **大きな文書での入力遅延は、Y.js とエディタの同期層（y-prosemirror）が主因です。** 4x・2,000 段落で、共同編集ありは p50 107ms、なしは 47ms でした。UI フレームワークを変えても解決しない問題なので、文書サイズの上限や分割など、エディタ設計の論点として扱います。
3. **AI ストリーミングの重さは、描画方式（再描画か直接追記か）ではなくレイアウトが原因でした。** 1 つの巨大なテキストブロックに追記し続けると、4x・10,000 トークンで `state` も `direct` も 21〜24fps、長いタスクが合計 16 秒に達します。段落ごとにブロックを分ける `blocks` なら 58fps を保てます。本番の AI チャットでは段落（Markdown ブロック）単位で追記する設計にします。
4. **TDD は回せます。** `hono/jsx/dom` のコンポーネントは Vitest + happy-dom + Testing Library でテストでき、ロジックは素の TypeScript に分ければミューテーションテストの対象にもできます。
5. **落とし穴**: ワーカー側の TSX は `hono/jsx`（サーバー用）、クライアント側は `hono/jsx/dom` と、JSX ランタイムを分ける必要があります。wrangler（esbuild）は `tsconfig.json` 以外を自動では読まないため、`wrangler.jsonc` の `tsconfig` を指定しないと `React is not defined` になります。
6. **自作した土台は合計約 400 行です**（ルーター、データ取得、仮想リストの各アダプタ、遅延読み込み、パレット、候補ポップアップ）。いずれもテスト付きです。

## 次に確かめること

- 認証（Better Auth）と D1 を入れた状態での一覧と同期
- Markdown 描画を含む AI チャット（`blocks` 方式の延長）
- 大きな文書の扱い（文書の分割、y-prosemirror の更新コストの調査）
- Tauri でのビルド（同じ SPA バンドルを同梱）
