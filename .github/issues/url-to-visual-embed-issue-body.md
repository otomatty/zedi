# 外部 URL のビジュアル変換（Gyazo / YouTube / OGP 等）

## 概要

Gyazo、YouTube など外部サイトの URL を貼り付けた際、URL 文字列のままではなく視覚的な要素（画像・埋め込み）に変換して表示する。画像 URL は既に対応しているが、Gyazo の permalink や YouTube など拡張子のない URL にも対応する。

## 動機

- Gyazo の permalink（`https://gyazo.com/xxxxx`）を貼り付けても画像として表示されず、リンクのままである
- YouTube URL を貼り付けても埋め込みプレビューにならない
- 視覚的にわかりやすいメモ作成のため、URL を可能な限りビジュアル要素に変換したい

## 現状の実装と根拠

| 対象                   | 変換先                | 対応状況 | 根拠                                                          |
| ---------------------- | --------------------- | -------- | ------------------------------------------------------------- |
| 画像 URL（拡張子付き） | `image` ノード        | 対応     | `usePasteImageHandler`, `StorageImage.addInputRules`          |
| Gyazo permalink        | 画像                  | 未対応   | 拡張子がないため `IMAGE_URL_PATTERN` にマッチしない           |
| YouTube URL            | 埋め込み              | 未対応   | 画像/埋め込みのペースト変換なし                               |
| 一般 Web URL           | Link card             | 未対応   | 現状はリンクのまま                                            |
| Web Clipper の OGP     | 先頭に `image` ノード | 部分的   | `formatClippedContentAsTiptap` で `thumbnailUrl` を先頭に追加 |

- Gyazo permalink は `https://gyazo.com/{id}` 形式。画像表示には `https://i.gyazo.com/{id}.png` への正規化が必要
- 既存の `isEmbeddableImageUrl` で localhost / プライベート IP 等を拒否しており、このセキュリティ制約は維持する

## 実装案

### 案 A: クライアント側で URL allowlist + サービス別変換

- Gyazo: `gyazo.com/{id}` → `i.gyazo.com/{id}.png` に正規化して画像ノード
- YouTube: URL → 埋め込みノード（動画埋め込み issue と連携）
- その他（X, Vimeo 等）: サービスごとに URL パターンと変換先を定義
- メリット: サーバー不要、既存のペーストフローに乗せるだけ
- デメリット: 各サービスの URL 形式変更に追従が必要。OGP カードはクライアント単体では CORS で困難な場合あり

### 案 B: サーバー側で oEmbed / OGP 解決 API

- `/api/oembed?url=...` や `/api/meta?url=...` でメタデータ取得
- クライアントは統一レスポンスでカード/埋め込みを描画
- メリット: CORS を避けられる。一般 URL の OGP カード化がしやすい
- デメリット: サーバー実装・レート制限・キャッシュ設計が必要

## 推奨案と理由

**案 A** を第一歩とする。Gyazo 正規化と YouTube 埋め込み（動画埋め込み issue と合わせて）を先行し、利用状況を見て oEmbed/OGP API（案 B）を検討する。既存の `usePasteImageHandler` を拡張する形で対応でき、変更範囲が限定される。

## 影響ファイル

- `src/components/editor/TiptapEditor/usePasteImageHandler.ts` — Gyazo / YouTube 等の URL 判定・変換ロジック追加
- または `StorageImageExtension.ts` の `addInputRules` に Gyazo パターン追加
- 動画埋め込み issue との連携: YouTube は当該 issue で実装する YouTube ノードへ変換

## 受け入れ条件

- [ ] Gyazo permalink（`https://gyazo.com/{id}`）を貼り付けた際に画像として表示される
- [ ] YouTube URL を貼り付けた際に視覚的な埋め込みとして表示される（動画 issue と連携）
- [ ] プライベート IP・localhost・不正スキーム等の安全制約が維持される（`isEmbeddableImageUrl` 相当）
- [ ] 変換できない URL は従来通りリンクのまま保持される
- [ ] エディタ保存・再読み込みで表示崩れしない
- [ ] `bun run lint` および `bun run format:check` が通る

## 非対象 / リスク

- **一般 URL の OGP カード化**: 案 B を採用する場合の将来タスク。本 issue では Gyazo / YouTube を優先
- **iframe の無制限許可**: XSS リスクのため、許可する埋め込み元は YouTube 等の allowlist に限定
- **ローカル・プライベート URL**: 既存の拒否ルールを維持

## 追加情報

- 調査・根拠の詳細: [docs/investigations/url-to-visual-embed.md](docs/investigations/url-to-visual-embed.md)
- 動画埋め込み調査（YouTube 埋め込みとの連携）: [docs/investigations/video-embed-in-editor.md](docs/investigations/video-embed-in-editor.md)
- 関連 issue: 動画埋め込み対応（YouTube ノード実装）
