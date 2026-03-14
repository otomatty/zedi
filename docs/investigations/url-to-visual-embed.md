# 外部 URL のビジュアル変換（Gyazo / YouTube / OGP 等）の調査

**日時**: 2026-03-14  
**対象**: エディタ内 URL 貼り付け、Web Clipper、OGP 取得

## 1. 現状

### 1.1 URL → ビジュアル変換の実態

| 対象                              | 変換先                 | 対応状況 | 根拠コード                                                    |
| --------------------------------- | ---------------------- | -------- | ------------------------------------------------------------- |
| 画像 URL（拡張子付き）            | `image` ノード         | 対応     | `usePasteImageHandler`, `StorageImage.addInputRules`          |
| Gyazo permalink (`gyazo.com/...`) | 画像                   | 未対応   | 拡張子がないため `IMAGE_URL_PATTERN` にマッチしない           |
| YouTube URL                       | 埋め込み               | 未対応   | 画像/埋め込みのペースト変換なし                               |
| 一般 Web URL                      | Link card / OGP カード | 未対応   | 現状はリンクのまま                                            |
| Web Clipper の OGP                | 先頭に `image` ノード  | 部分的   | `formatClippedContentAsTiptap` で `thumbnailUrl` を先頭に追加 |

### 1.2 関連ファイルと役割

| ファイル                   | 役割                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- | ---- | ------------------------------ |
| `usePasteImageHandler.ts`  | ペースト時に画像ファイル or 画像拡張子 URL を検出、`setImage` で埋め込み                 |
| `StorageImageExtension.ts` | InputRules: 末尾が `.jpg                                                                 | .png | ...` の URL を画像ノードに変換 |
| `webClipper.ts`            | URL から HTML 取得、Readability で本文抽出、OGP 取得                                     |
| `htmlToTiptap.ts`          | `formatClippedContentAsTiptap` — OGP の `thumbnailUrl` を先頭に `image` ノードとして挿入 |
| `FloatingActionButton.tsx` | Web Clipper ダイアログから `handleWebClipped` で新規ページ作成                           |

### 1.3 Gyazo の URL 形式

| 形式            | 例                             | 備考                                                                        |
| --------------- | ------------------------------ | --------------------------------------------------------------------------- |
| direct 画像 URL | `https://i.gyazo.com/{id}.png` | 画像拡張子あり → 既存で画像化可能                                           |
| permalink       | `https://gyazo.com/{id}`       | 拡張子なし → 現状は未対応。画像化には `i.gyazo.com/{id}.png` に正規化が必要 |

### 1.4 セキュリティ制約（既存）

- `usePasteImageHandler`: localhost / 127.0.0.1 / プライベート IP / `.local` を拒否（`isEmbeddableImageUrl`）
- `Link.configure`: `javascript:` 等の危険なプロトコル拒否（`isAllowedUri`）

## 2. 課題と根拠

| 課題                                              | 根拠                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Gyazo permalink が画像として表示されない          | 拡張子ベースの `IMAGE_URL_PATTERN` にマッチしない                              |
| YouTube URL がリンクのまま                        | ペースト時の埋め込み変換が未実装（動画埋め込み issue と重複）                  |
| 一般 URL の OGP カード化がない                    | Web Clipper は「新規ページ作成」専用。エディタ本文中の URL は変換しない        |
| サービスごとの URL 正規化ロジックが分散していない | 現状は画像のみで、変換ルールが `usePasteImageHandler` と `StorageImage` に分散 |

## 3. 影響範囲

| 対象         | 影響内容                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------- |
| ペースト処理 | 画像以外の URL 種別（Gyazo, YouTube, 一般）の検出・分岐                                     |
| ストレージ   | Gyazo は既存プロバイダでアップロードは対応済み。permalink の表示用 URL 解決はクライアント側 |
| サーバー API | oEmbed / OGP 解決をサーバー側で行う案の場合、新規 API が必要                                |
| エディタ拡張 | リンクカード用ノード、埋め込みノード（YouTube 等）の追加                                    |

## 4. 推奨対応

### 4.1 実装案の比較

**案 A: クライアント側で URL allowlist + サービス別変換**

- Gyazo: `gyazo.com/{id}` → `i.gyazo.com/{id}.png` に正規化して画像ノード
- YouTube: URL → 埋め込みノード（動画埋め込み issue と連携）
- その他（X, Vimeo 等）: サービスごとに URL パターンと変換先を定義
- メリット: サーバー不要、既存のペーストフローに乗せるだけ
- デメリット: 各サービスの URL 形式変更に追従が必要。OGP カードはクライアント単体では取得が CORS で困難な場合あり

**案 B: サーバー側で oEmbed / OGP 解決 API**

- `/api/oembed?url=...` や `/api/meta?url=...` でメタデータ取得
- クライアントは統一レスポンスでカード/埋め込みを描画
- メリット: CORS を避けられる。一般 URL の OGP カード化がしやすい
- デメリット: サーバー実装・レート制限・キャッシュ設計が必要

**推奨**: **案 A** を第一歩とする。Gyazo 正規化と YouTube 埋め込み（動画 issue と合わせて）を先行し、利用状況を見て oEmbed/OGP API（案 B）を検討する。

### 4.2 最低限の変更一覧（案 A）

1. **Gyazo permalink 対応**
   - `usePasteImageHandler`: `gyazo.com/{id}` を検出し、`i.gyazo.com/{id}.png` に変換して `setImage` 呼び出し
   - または `StorageImageExtension.addInputRules` に Gyazo パターンを追加

2. **YouTube URL** → 動画埋め込み issue に委譲（同上）

3. **URL 判定ロジックの整理**
   - `usePasteImageHandler` 内で画像 / Gyazo / YouTube 等を判定し、該当する変換を実行
   - どのパターンにも当てはまらない場合は従来通り（リンクのまま）

4. **失敗時フォールバック**
   - 変換試行後、エラーや不正 URL の場合はプレーンなリンクとして挿入
   - `isEmbeddableImageUrl` と同様のセキュリティチェックを維持

5. **Link card / OGP カード**（将来）
   - 案 B を採用する場合、専用ノードと NodeView を追加

### 4.3 非対象・リスク

- **iframe の無制限許可**: XSS リスクのため、許可する埋め込み元は YouTube 等の allowlist に限定
- **ローカル・プライベート URL**: 既存の `isEmbeddableImageUrl` と同様に拒否を維持
- **大容量メタ取得**: サーバー側 API を入れる場合、タイムアウト・レート制限を設計する

## 5. 参照

- 既存実装: [usePasteImageHandler.ts](../src/components/editor/TiptapEditor/usePasteImageHandler.ts)
- 既存実装: [StorageImageExtension.ts](../src/components/editor/extensions/StorageImageExtension.ts)
- Gyazo API: `GyazoProvider.ts` — アップロード時は `url`（直接画像 URL）を返す
- 動画埋め込み調査: [video-embed-in-editor.md](./video-embed-in-editor.md)
