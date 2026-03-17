# ローカルファイルアップロードと WebM 変換の調査

**日時**: 2026-03-14  
**対象**: メモエディタ、画像アップロード周辺、ストレージプロバイダー

## 1. 現状

### 1.1 アップロード対応の実態

| 対象                                | 対応状況 | 根拠コード                                                    |
| ----------------------------------- | -------- | ------------------------------------------------------------- |
| 画像（ファイル選択・D&D・ペースト） | 対応     | `useImageUploadManager`, `filterImageFiles`（`image/*` のみ） |
| 画像のサイズ圧縮                    | 対応     | `convertToWebP` — JPEG/PNG → WebP（Canvas API）               |
| 動画（ファイル）                    | 未対応   | `filterImageFiles` が `image/*` のみ、`video/*` は除外        |
| その他ファイル（PDF 等）            | 未対応   | 同上                                                          |

### 1.2 既存フロー（画像）

```
ファイル選択/D&D/ペースト
  → filterImageFiles（画像のみ通過）
  → imageUpload ノード挿入（プレースホルダー表示）
  → convertToWebP（JPEG/PNG のみ変換）
  → provider.uploadImage(file)
  → image ノードに置換
```

### 1.3 関連ファイルと役割

| ファイル                          | 役割                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `useImageUploadManager.ts`        | 画像アップロードの orchestration（ファイル受付、進捗、再試行）        |
| `useImageUploadManagerHelpers.ts` | `filterImageFiles`, `runSingleUpload`, `convertToWebP` 呼び出し       |
| `convertToWebP.ts`                | Canvas API で画像を WebP に変換（クライアント側）                     |
| `StorageProviderInterface`        | `uploadImage(file: File)` — プロバイダーは File を受け取り URL を返す |
| `server/api/src/routes/media.ts`  | S3 アップロード API。`content_type` 制限なし（動画可）                |

### 1.4 ストレージプロバイダーと動画の可否

| プロバイダー             | 動画対応 | 根拠                                                       |
| ------------------------ | -------- | ---------------------------------------------------------- |
| S3Provider（デフォルト） | 可能     | `content_type` をそのまま S3 に渡す。`video/webm` 等を許可 |
| GyazoProvider            | 不可     | API が `imagedata` 専用。Gyazo は画像のみ                  |
| GitHubProvider           | 要確認   | リポジトリにバイナリアップロード可能だが、動画向けではない |

動画アップロードは **S3Provider（デフォルトストレージ）前提** が現実的。

### 1.5 WebM 変換の技術選択肢

| 方式                            | メリット                                     | デメリット                                                      |
| ------------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| **FFmpeg.wasm**（クライアント） | サーバー不要、プライバシー、オフライン対応可 | バンドル増（WASM 約 25MB）、処理が 5〜20 倍遅い、COOP/COEP 必須 |
| **サーバー側 FFmpeg**           | 大容量・長時間動画に有利、高速               | インフラに FFmpeg 導入が必要、サーバー負荷                      |
| **変換なし**                    | 実装不要                                     | ファイルサイズが大きい（mp4 のままだと重い）                    |

## 2. 課題と根拠

| 課題                               | 根拠                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| 動画ファイルをアップロードできない | `filterImageFiles` が `image/*` のみ。動画用フローが未実装                               |
| 動画ノードがない                   | Tiptap に `video` ノードが未登録。`contentUtils.ts` の `SUPPORTED_NODE_TYPES` にも未追加 |
| 動画のサイズ圧縮手段がない         | `convertToWebP` は画像専用。動画用の WebM 変換は未実装                                   |
| ストレージの制約                   | Gyazo 等は動画非対応。S3 のみ対象とする設計が必要                                        |

## 3. 影響範囲

| 対象                  | 影響内容                                                                      |
| --------------------- | ----------------------------------------------------------------------------- |
| エディタ拡張          | `video` / `videoUpload` ノードの追加、`editorConfig.ts` への登録              |
| アップロードフロー    | `filterImageFiles` の拡張 or `filterVideoFiles` の新設、動画用 upload manager |
| 変換処理              | `convertToWebM` の新規実装（FFmpeg.wasm またはサーバー API）                  |
| ストレージ            | S3Provider のみ動画対応。Gyazo 利用時は動画アップロードを無効化 or エラー表示 |
| contentUtils          | `SUPPORTED_NODE_TYPES` に `video` を追加                                      |
| Markdown エクスポート | 動画ノードの出力形式を定義                                                    |

## 4. 推奨対応

### 4.1 実装案の比較

**案 A: FFmpeg.wasm でクライアント側 WebM 変換**

- `@ffmpeg/ffmpeg` + `@ffmpeg/util` を導入
- `convertToWebM(file: File): Promise<File>` を実装（`convertToWebP` と同様の責務分離）
- 動画選択後、変換完了してからアップロード
- メリット: サーバー変更不要、プライバシーに配慮
- デメリット: WASM バンドル増、変換に時間がかかる、COOP/COEP ヘッダー設定が必要

**案 B: サーバー側 FFmpeg で変換**

- `POST /api/media/transcode` 等の新規 API を追加
- クライアントは動画を送信、サーバーで FFmpeg 実行、WebM を S3 に保存して URL 返却
- メリット: クライアント負荷軽減、大容量動画に有利
- デメリット: Railway 等に FFmpeg バイナリの導入が必要、インフラ設計

**案 C: 変換なしでアップロード**

- 動画をそのまま（mp4 等）アップロード
- メリット: 実装が簡単
- デメリット: ファイルサイズが大きい。ユーザー要件「ファイルサイズを小さくする」に反する

**推奨**: まず **案 A（FFmpeg.wasm）** を採用。既存の `convertToWebP` と同様にクライアント側で変換するパターンに揃える。大容量動画や変換時間が課題になった場合は案 B を検討する。

### 4.2 最低限の変更一覧（案 A 採用時）

1. **convertToWebM の新規実装**
   - `src/lib/storage/convertToWebM.ts`
   - FFmpeg.wasm で `video/mp4`, `video/quicktime` 等 → `video/webm` に変換
   - 既に WebM の場合はそのまま返す
   - 非対応環境では元ファイルを返す（フォールバック）

2. **動画アップロードフローの追加**
   - `filterVideoFiles` の新設 or `filterMediaFiles` で画像＋動画を許可
   - `videoUpload` ノードと `video` ノードの Tiptap 拡張
   - `useVideoUploadManager` または `useImageUploadManager` の拡張（動画分岐）

3. **ストレージ制約の扱い**
   - 動画は S3Provider のみ許可。Gyazo 選択時は動画アップロードを無効化し、Toast で案内

4. **Vite / サーバー設定**
   - COOP: `same-origin`、COEP: `require-corp` のヘッダー設定（FFmpeg.wasm の SharedArrayBuffer 用）
   - FFmpeg.wasm の WASM ファイルを CDN から遅延ロード（初回変換時のみ）

5. **contentUtils / markdownExport**
   - `SUPPORTED_NODE_TYPES` に `video` を追加
   - 動画ノードの Markdown 出力（例: `[動画](URL)`）

### 4.3 非対象・リスク

- **Gyazo での動画アップロード**: API が画像専用のため非対応。S3 利用を促す UX が必要
- **大容量動画（例: 500MB 超）**: クライアント側変換はメモリ・時間の制約あり。将来的にサーバー変換を検討
- **全ファイル形式**: 当面は `video/*`（mp4, mov, webm 等）に限定。PDF 等は将来対応

## 5. 参照

- 既存実装: [convertToWebP.ts](../../src/lib/storage/convertToWebP.ts)
- 既存実装: [useImageUploadManagerHelpers.ts](../../src/components/editor/TiptapEditor/useImageUploadManagerHelpers.ts)
- [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)
- [FFmpeg.wasm Usage](https://ffmpegwasm.netlify.app/docs/getting-started/usage/)
- 動画埋め込み調査: [video-embed-in-editor.md](./video-embed-in-editor.md)
