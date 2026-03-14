# 動画埋め込み対応（メモエディタ）

## 概要

メモエディタに動画埋め込み機能を追加する。画像埋め込みは既にあるが、動画（特に YouTube URL）を貼り付けた際に URL のままではなく視覚的な埋め込みとして表示できるようにする。

## 動機

- メモに YouTube 動画を参照として埋め込みたいニーズがある
- 現在は URL を貼り付けてもリンクのままとなり、プレビューやサムネイルが出ない
- 画像埋め込みと同様の体験で動画も埋め込めるようにしたい

## 現状の実装と根拠

| 種類                   | 対応状況 | 根拠コード                                                  |
| ---------------------- | -------- | ----------------------------------------------------------- |
| 画像（ファイル）       | 対応     | `useImageUploadManager.ts` → `imageUpload` → `image` ノード |
| 画像（URL 貼り付け）   | 対応     | `usePasteImageHandler.ts` — 画像拡張子 URL のみ             |
| 動画（ファイル）       | 未対応   | `filterImageFiles` が `image/*` のみ、`video/*` は対象外    |
| 動画（URL 貼り付け）   | 未対応   | `usePasteImageHandler` は画像 URL のみ処理                  |
| YouTube / 外部埋め込み | 未対応   | `@tiptap/extension-youtube` 未導入、関連ノードなし          |

- `SUPPORTED_NODE_TYPES`（`contentUtils.ts`）に追加しないノードは保存/読み込み時に除去される
- `markdownExport.ts` の `nodeHandlers` に登録しないノードは Markdown 出力で空になる
- Tiptap v3 系を使用しており、拡張は v3 互換が必要

## 実装案

### 案 A: Tiptap 公式 YouTube 拡張を導入

- `@tiptap/extension-youtube` を追加し、`editorConfig.ts` で登録
- YouTube URL 貼り付け時に `setYoutubeVideo({ src })` で埋め込み
- メリット: 公式サポート、URL 正規化・バリデーションが組み込み
- デメリット: YouTube 専用。Vimeo 等は別拡張が必要

### 案 B: 汎用 videoEmbed ノードを独自実装

- `videoEmbed` ノードを独自拡張し、`src` / `provider` (youtube \| vimeo \| ...) を属性で保持
- 各プロバイダの URL 正規化をクライアント側で実装
- メリット: 複数サービスを 1 ノードで扱える
- デメリット: 実装・保守コストが大きい

## 推奨案と理由

**案 A（YouTube 専用）** を推奨。まず YouTube で着手し、利用状況を見てから案 B や他サービス対応を検討する。`@tiptap/extension-youtube` は v3 系で利用可能（v3.20.1）であり、既存スタックと整合する。

## 影響ファイル

- `package.json` — `@tiptap/extension-youtube` 追加
- `src/components/editor/TiptapEditor/editorConfig.ts` — YouTube 拡張を登録
- `src/components/editor/TiptapEditor/usePasteImageHandler.ts` 拡張 または `usePasteEmbedHandler.ts` 新規 — ペースト時に YouTube URL を検出
- `src/lib/contentUtils.ts` — `SUPPORTED_NODE_TYPES` に `youtube` を追加
- `src/lib/markdownExport.ts` — `youtube` ノードの Markdown 出力方針を定義
- `src/components/editor/TiptapEditor/slashCommandItems.ts`（任意）— `/youtube` または `/video` で埋め込み挿入

## 受け入れ条件

- [ ] YouTube URL を貼り付けた際に視覚的な埋め込み（iframe 等）に変換される
- [ ] 非対応 URL は従来通り通常リンクのまま保持される
- [ ] 保存・再読み込み後に埋め込みが正しく表示される（`SUPPORTED_NODE_TYPES` への追加を反映）
- [ ] Markdown エクスポート時、YouTube ノードが適切な形式（例: `[YouTube](URL)`）で出力される
- [ ] `bun run lint` および `bun run format:check` が通る
- [ ] 既存の `usePasteImageHandler` テストなど関連テストが通る（必要に応じて更新）

## 非対象 / リスク

- **ローカル動画ファイル（mp4 等）**: ストレージプロバイダーの動画対応が必要。本 issue では YouTube URL 埋め込みを優先し、ローカル動画は将来タスクとする
- **Vimeo 等他サービス**: 案 A では YouTube のみ。必要に応じて別 issue で対応
- **Web Clipper の video 除去**: `htmlToTiptap.ts` の `cleanupHtml` で `video` を削除しているが、これは「クリップ対象ページの HTML」に対する処理。エディタ側の YouTube ノードとは別物であり、現状維持でよい

## 追加情報

- 調査・根拠の詳細: [docs/investigations/video-embed-in-editor.md](docs/investigations/video-embed-in-editor.md)
- [Tiptap YouTube extension](https://tiptap.dev/docs/editor/extensions/nodes/youtube)
- [@tiptap/extension-youtube (npm)](https://www.npmjs.com/package/@tiptap/extension-youtube)
