# ローカルファイルアップロードと WebM 変換

## 概要

メモエディタにローカルファイル（主に動画）のアップロード機能を追加し、ファイルサイズ削減のために WebM 形式への変換を行う。既存の画像アップロードと同様の UX（選択・D&D・ペースト）で動画も扱えるようにする。

## 動機

- ローカルに保存した動画（mp4, mov 等）をメモに埋め込みたい
- 現在は画像のみアップロード可能で、動画は対象外
- 動画ファイルは容量が大きいため、WebM 変換でサイズを抑えたい

## 現状の実装と根拠

| 対象                                | 対応状況 | 根拠                                             |
| ----------------------------------- | -------- | ------------------------------------------------ |
| 画像（ファイル選択・D&D・ペースト） | 対応     | `filterImageFiles` が `image/*` のみ許可         |
| 画像のサイズ圧縮                    | 対応     | `convertToWebP` で JPEG/PNG → WebP（Canvas API） |
| 動画（ファイル）                    | 未対応   | `filterImageFiles` が `video/*` を除外           |
| 動画用ノード                        | 未対応   | Tiptap に `video` ノード未登録                   |

- S3Provider（デフォルトストレージ）は `content_type` 制限がなく、動画アップロードは可能
- GyazoProvider は画像専用 API のため動画非対応
- 既存の `convertToWebP` と同様に、変換処理を責務分離したユーティリティとして実装する方針

## 実装案

### 案 A: FFmpeg.wasm でクライアント側 WebM 変換

- `@ffmpeg/ffmpeg` + `@ffmpeg/util` を導入
- `convertToWebM(file: File): Promise<File>` を新規実装
- 動画選択後、変換完了してからアップロード
- メリット: サーバー変更不要、プライバシーに配慮
- デメリット: WASM バンドル増（約 25MB）、処理が遅い、COOP/COEP ヘッダーが必要

### 案 B: サーバー側 FFmpeg で変換

- `POST /api/media/transcode` 等の新規 API を追加
- サーバーで FFmpeg 実行、WebM を S3 に保存して URL 返却
- メリット: クライアント負荷軽減、大容量動画に有利
- デメリット: インフラに FFmpeg 導入が必要

### 案 C: 変換なしでアップロード

- 動画をそのまま（mp4 等）アップロード
- メリット: 実装が簡単
- デメリット: ファイルサイズが大きい。要件「ファイルサイズを小さくする」に反する

## 推奨案と理由

**案 A（FFmpeg.wasm）** を推奨。既存の `convertToWebP` と同様にクライアント側で変換するパターンに揃える。サーバー変更が不要で、プライバシーも確保できる。大容量動画や変換時間が課題になった場合は案 B を検討する。

## 影響ファイル

- `package.json` — `@ffmpeg/ffmpeg`, `@ffmpeg/util` 追加
- `src/lib/storage/convertToWebM.ts` — 新規（WebM 変換ロジック）
- `src/components/editor/TiptapEditor/useImageUploadManagerHelpers.ts` — 動画分岐、`convertToWebM` 呼び出し
- 動画用 Tiptap 拡張（`video` / `videoUpload` ノード）— 新規
- `src/components/editor/TiptapEditor/editorConfig.ts` — 動画拡張の登録
- `src/lib/contentUtils.ts` — `SUPPORTED_NODE_TYPES` に `video` を追加
- `src/lib/markdownExport.ts` — 動画ノードの Markdown 出力
- Vite / サーバー設定 — COOP/COEP ヘッダー（FFmpeg.wasm の SharedArrayBuffer 用）

## 受け入れ条件

- [ ] 動画ファイル（mp4, mov, webm 等）を選択・D&D・ペーストでアップロードできる
- [ ] アップロード前に WebM 形式に変換され、ファイルサイズが削減される（既に WebM の場合はそのまま）
- [ ] 動画は S3Provider（デフォルトストレージ）でのみアップロード可能。Gyazo 選択時は動画を無効化し、適切に案内する
- [ ] エディタ内に動画が埋め込み表示され、保存・再読み込み後も正しく表示される
- [ ] Markdown エクスポート時、動画ノードが適切な形式で出力される
- [ ] `bun run lint` および `bun run format:check` が通る

## 非対象 / リスク

- **Gyazo での動画アップロード**: API が画像専用のため非対応
- **大容量動画（例: 500MB 超）**: クライアント側変換はメモリ・時間の制約あり。将来的にサーバー変換を検討
- **PDF 等他ファイル形式**: 当面は `video/*` に限定
- **YouTube URL 埋め込み**: 別 issue（#362）で対応予定

## 追加情報

- 調査・根拠の詳細: [docs/investigations/local-file-upload-webm-conversion.md](docs/investigations/local-file-upload-webm-conversion.md)
- [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)
- 動画埋め込み調査: [docs/investigations/video-embed-in-editor.md](docs/investigations/video-embed-in-editor.md)
