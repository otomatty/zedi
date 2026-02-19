# URLからページ作成：CORS・プロキシエラー分析

## 概要
Web Clipping（URLからページを作成する機能）で、`api.allorigins.win` および `corsproxy.io` 経由の取得が失敗している。

## 発生しているエラー

### 1. api.allorigins.win

- **CORS**: `Access to fetch at 'https://api.allorigins.win/raw?url=...' from origin 'https://zedi-note.app' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
- **ネットワーク**: `GET ... net::ERR_FAILED 522`

**分析**
- **522** は Cloudflare などで「Origin が応答しなかった（タイムアウト）」を意味する。allorigins の裏側がダウンまたは高負荷で、正常なレスポンスが返っていない。
- レスポンスが返らない／エラーレスポンスになると、CORS ヘッダーも付与されないため、ブラウザは「CORS エラー」として報告する。つまり **522 が原因で、結果として CORS のように見えている**。
- いずれにせよ、**サードパーティの CORS プロキシに依存している時点で不安定**（ダウン・レート制限・ドメイン制限の可能性がある）。

### 2. corsproxy.io（フォールバック）

- **HTTP**: `GET https://corsproxy.io/?https%3A%2F%2Fzenn.dev%2F... 403 (Forbidden)`
- **ログ**: `Proxy https://corsproxy.io/? failed: Error: HTTP error: 403`

**分析**
- プロキシが **403 Forbidden** で明示的に拒否している。
- 想定される理由:
  - 取得先ドメイン（zenn.dev）のブロックまたは制限
  - リファラー／Origin（zedi-note.app）の制限やレート制限
  - 利用規約による商用・本番ドメインのブロック

### 3. 根本原因の整理

| 要因 | 説明 |
|------|------|
| **ブラウザからの直接取得** | ブラウザから他サイトへ `fetch` すると CORS の制約を受ける。多くのサイトは `Access-Control-Allow-Origin` を返さないため、フロントだけで取得するには「CORS プロキシ」が必要。 |
| **サードパーティ CORS プロキシの依存** | allorigins.win / corsproxy.io は **信頼性・可用性が保証されない**。ダウン・522・403・レート制限などで失敗する。 |
| **本番オリジン** | `zedi-note.app` からのリクエストがプロキシ側でブロック・制限されている可能性がある。 |

## 推奨対応：バックエンドで HTML 取得

**CORS はブラウザの制限**のため、**同じオリジン（zedi-note.app）の API に「この URL の HTML を取って」と依頼し、サーバー側で fetch する**ようにすれば、CORS の影響を受けない。

1. **バックエンド**（例: `POST /api/clip/fetch`）で `url` を受け取り、サーバー側で `fetch(url)` して HTML を取得。
2. **フロント**はその API だけを呼ぶ（同一オリジンなので CORS 問題なし）。
3. 取得した HTML はこれまで通りフロントで `DOMParser` + Readability で解析し、クリップ内容を生成する。

これにより:
- サードパーティの CORS プロキシに依存しなくなる
- 522 / 403 は「プロキシの都合」ではなく「取得先 URL の応答」に限定して扱える
- 必要ならサーバー側で URL 検証・ホスト制限・タイムアウトを一元管理できる

## 対応内容（実装済み）

- **POST /api/clip/fetch** を Lambda に追加（`handlers/clip.mjs`）。body: `{ url }` → サーバー側で `fetch(url)` し `{ html }` を返す。
- フロント: **apiClient.clipFetchHtml(url)** を追加。**useWebClipper({ api })** で API を渡すとサーバー側取得を優先し、失敗時のみ CORS プロキシにフォールバック。
- **WebClipperDialog** で `useAuth` + `createApiClient` により `api` を生成し、`useWebClipper({ api })` に渡すように変更。

デプロイ後は zenni.dev 等の URL もサーバー経由で取得されるため、CORS・522・403 の影響を避けられる。

## 関連ファイル

- `src/lib/webClipper.ts` — `clipWebPage(url, fetchHtmlFn?)`、CORS プロキシはフォールバック
- `src/hooks/useWebClipper.ts` — `useWebClipper({ api })`、`clipWebPage` に `fetchHtmlFn` を渡す
- `src/components/editor/WebClipperDialog.tsx` — `createApiClient` + `useWebClipper({ api })`
- `src/lib/api/apiClient.ts` — `clipFetchHtml(url)`
- `terraform/modules/api/lambda/router.mjs` — `POST /api/clip/fetch` ルート
- `terraform/modules/api/lambda/handlers/clip.mjs` — サーバー側 HTML 取得
