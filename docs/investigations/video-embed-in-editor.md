# メモエディタでの動画埋め込み対応の調査

**日時**: 2026-03-14  
**対象**: Tiptap エディタ、画像埋め込み周辺実装

## 1. 現状

### 1.1 埋め込み対応の実態

| 種類                   | 対応状況 | 根拠コード                                                  |
| ---------------------- | -------- | ----------------------------------------------------------- | ---- | ---- | ----------- |
| 画像（ファイル）       | 対応     | `useImageUploadManager.ts` → `imageUpload` → `image` ノード |
| 画像（URL 貼り付け）   | 対応     | `usePasteImageHandler.ts` — 画像拡張子 URL のみ             |
| 画像（InputRules）     | 対応     | `StorageImageExtension.ts` — 末尾が `.jpg                   | .png | .gif | ...` の URL |
| 動画（ファイル）       | 未対応   | `filterImageFiles` が画像のみ許可、`video/*` は対象外       |
| 動画（URL 貼り付け）   | 未対応   | `usePasteImageHandler` は画像 URL のみ処理                  |
| YouTube / 外部埋め込み | 未対応   | `@tiptap/extension-youtube` 未導入、関連ノードなし          |

### 1.2 関連ファイルと役割

| ファイル                   | 役割                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `editorConfig.ts`          | Tiptap 拡張登録の中心。`ImageUpload` / `StorageImage` を登録         |
| `usePasteImageHandler.ts`  | ペースト時の画像ファイル・画像 URL 検出・変換                        |
| `StorageImageExtension.ts` | 画像ノード拡張、InputRules（末尾が画像拡張子の URL）                 |
| `contentUtils.ts`          | `SUPPORTED_NODE_TYPES` で未対応ノードをサニタイズ時に除去            |
| `markdownExport.ts`        | Tiptap → Markdown 変換、`image` ノードは `![alt](url)` に出力        |
| `htmlToTiptap.ts`          | Web Clipper 用。`cleanupHtml` で `video` / `iframe` / `embed` を削除 |
| `slashCommandItems.ts`     | スラッシュコマンド定義、`/image` で画像挿入のみ                      |

### 1.3 制約事項

- `SUPPORTED_NODE_TYPES` に追加しないノードは保存/読み込み時に除去される（`paragraph` に変換される）
- `markdownExport.ts` の `nodeHandlers` に登録しないノードは Markdown 出力で空になる
- Tiptap v3 系（@tiptap/core ^3.20.0）を使用しており、拡張は v3 互換が必要

## 2. 課題と根拠

| 課題                                           | 根拠                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| 動画ファイルのアップロード・埋め込みができない | `filterImageFiles` が `image/*` のみ、`video/*` は未対応              |
| YouTube URL を貼り付けてもリンクのまま         | `usePasteImageHandler` は `IMAGE_URL_PATTERN`（拡張子ベース）のみ処理 |
| 埋め込みノードを追加する設計パターンがない     | 画像・Mermaid・数式など既存パターンを参照する必要あり                 |

## 3. 影響範囲

| 対象                  | 影響内容                                                                               |
| --------------------- | -------------------------------------------------------------------------------------- |
| ストレージ            | 動画ファイルのアップロード先（既存プロバイダで動画対応可否）                           |
| Web Clipper           | `htmlToTiptap` の `video` 除去を維持するか、Tiptap 側に video ノードがあれば変換するか |
| リアルタイムコラボ    | Y.js スキーマに新ノード型を追加し、他クライアントと互換性を確認                        |
| Markdown エクスポート | 動画/YouTube ノードを `[タイトル](URL)` などで出力する方針が必要                       |

## 4. 推奨対応

### 4.1 実装案の比較

**案 A: Tiptap 公式 YouTube 拡張を導入**

- `@tiptap/extension-youtube` を追加し、`editorConfig.ts` で登録
- YouTube URL 貼り付け時に `setYoutubeVideo({ src })` で埋め込み
- メリット: 公式サポート、URL 正規化・バリデーションが組み込み
- デメリット: YouTube 専用。Vimeo 等は別拡張が必要

**案 B: 汎用 videoEmbed ノードを独自実装**

- `videoEmbed` ノードを独自拡張し、`src` / `provider` (youtube | vimeo | ...) を属性で保持
- 各プロバイダの URL 正規化をクライアント側で実装
- メリット: 複数サービスを 1 ノードで扱える
- デメリット: 実装・保守コストが大きい

**推奨**: まず **案 A（YouTube 専用）** で着手し、利用状況を見てから案 B や他サービス対応を検討する。

### 4.2 最低限の変更一覧

1. **依存追加**: `@tiptap/extension-youtube`（v3 系）
2. **editorConfig.ts**: YouTube 拡張を `createEditorExtensions` に追加
3. **usePasteImageHandler.ts** 拡張 or **usePasteEmbedHandler.ts** 新規: ペースト時に YouTube URL を検出し `setYoutubeVideo` を呼ぶ
4. **contentUtils.ts**: `SUPPORTED_NODE_TYPES` に `youtube` を追加
5. **markdownExport.ts**: `youtube` ノードを `[YouTube](URL)` 形式などで出力
6. **slashCommandItems.ts**（任意）: `/youtube` または `/video` で埋め込み挿入ダイアログを開く

### 4.3 動画ファイル（mp4 等）について

- HTML5 `<video>` タグで再生する汎用動画ノードを別途検討可能
- ストレージプロバイダーの動画アップロード対応が必要（Gyazo は画像専用のため要確認）
- 本調査では **YouTube URL 埋め込みを優先** し、ローカル動画ファイルは将来タスクとする

## 5. 参照

- [Tiptap YouTube extension](https://tiptap.dev/docs/editor/extensions/nodes/youtube)
- [@tiptap/extension-youtube (npm)](https://www.npmjs.com/package/@tiptap/extension-youtube)
- 既存実装: [editorConfig.ts](../src/components/editor/TiptapEditor/editorConfig.ts)
- 既存実装: [usePasteImageHandler.ts](../src/components/editor/TiptapEditor/usePasteImageHandler.ts)
