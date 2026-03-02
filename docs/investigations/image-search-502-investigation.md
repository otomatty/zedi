# 画像検索 502 エラー調査レポート

**調査日**: 2026-03-01  
**対象**: `GET /api/thumbnail/image-search` → 502 Bad Gateway

---

## 1. Railway ログの調査結果

### 1.1 実行コマンド

```bash
railway logs --service api --lines 300 --json
```

### 1.2 取得したエラーログ

```text
Image search failed: Error: Google Custom Search failed: 400 - {
  "error": {
    "code": 400,
    "message": "Request contains an invalid argument.",
    "errors": [
      {
        "message": "Request contains an invalid argument.",
        "domain": "global",
        "reason": "badRequest"
      }
    ],
    "status": "INVALID_ARGUMENT"
  }
}
```

スタックトレース:

```text
at searchImages (file:///app/dist/services/imageSearch.js:28:15)
at async file:///app/dist/routes/thumbnail/imageSearch.js:23:17
```

最終レスポンス:

```text
[api] GET /api/thumbnail/image-search → 502 画像検索に失敗しました。しばらくしてからもう一度お試しください。
```

---

## 2. 原因分析

**502 の直接原因**: アプリケーションは Google Custom Search API を呼び出したが、API が **400 Bad Request**（`INVALID_ARGUMENT`）を返した。ルートがこれを捕捉し、ユーザー向けに 502 を返している。

**根本原因**: Google Custom Search API が「不正な引数」としてリクエストを拒否している。

### 2.1 想定される INVALID_ARGUMENT の原因

| 原因                         | 説明                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **API エンドポイント**       | 旧 www / 新 customsearch の差。新 PSE (hex形式 cx) は customsearch.googleapis.com が互換性高い。              |
| **検索エンジン (cx) の設定** | Programmable Search Engine が「画像検索」に対応していない、または「ウェブ全体」を検索対象にしていない可能性。 |
| **クエリのエンコーディング** | 日本語クエリや全角イコール「＝」の扱いに問題がある可能性。                                                    |
| **start + num > 100**        | 100 件を超える範囲を要求した場合に INVALID_ARGUMENT になる。                                                  |

### 2.2 その他の可能性（API 側・Google Cloud 側）

| 項目                         | 確認方法                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API キー制限**             | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → 該当 API キー → 「アプリケーションの制限」が **「なし」** であること（HTTP リファラー制限があるとサーバーからのリクエストがブロックされる）。 |
| **Custom Search API 有効化** | [API とサービス](https://console.cloud.google.com/apis/library) で「Custom Search API」が有効になっているか。                                                                                                             |
| **API キーの API 制限**      | 「キーを制限」している場合、「Custom Search API」が許可リストに含まれているか。                                                                                                                                           |
| **検索エンジン ID の取得元** | [Programmable Search Engine](https://programmablesearchengine.google.com/controlpanel/all) の「基本」→「検索エンジン ID」を使用しているか。                                                                               |
| **デプロイ環境**             | `api-development-*.railway.app` を使う場合は **development** 環境にデプロイする必要あり。`railway up` のみだとリンク済み環境（production の可能性）にデプロイされる。                                                     |

---

## 3. 推奨対応

### 3.1 実装した修正（2026-03-01）

1. **imgSize / imgType の削除**: 任意パラメータだが INVALID_ARGUMENT の原因になる可能性があるため削除
2. **エンドポイント**: `customsearch.googleapis.com` も試したが 400 継続のため、安定動作報告の多い `www.googleapis.com` を維持

### 3.2 デバッグログの有効化

**Railway で環境変数を追加**: `DEBUG_IMAGE_SEARCH=true`

- **常時**: エラー発生時に `[imageSearch] Google API error:` で詳細を出力（key/cx はマスク済み）
- **DEBUG 有効時**: リクエスト前のパラメータ、成功時の件数も出力

ログで確認できる項目:

- `query`, `num`, `start`, `startPlusNum`（100 超で INVALID_ARGUMENT の可能性）
- `cxLength`, `cxHasColon`（検索エンジン ID の形式チェック）
- `rawError`（Google API の生のエラーレスポンス）

### 3.3 検索エンジン設定の確認

1. [Programmable Search Engine](https://programmablesearchengine.google.com/) で検索エンジンを開く
2. 「設定」→「基本」で以下を確認:
   - 「ウェブ全体を検索」が有効か
   - 「画像検索」が有効か（searchType=image の場合）

### 3.4 クエリのサニタイズ（必要に応じて）

日本語や記号を含むクエリで問題が続く場合、事前にサニタイズする:

- 全角記号を半角に変換
- 長すぎるクエリの切り詰め
- 不正文字の除去

### 3.5 エラーログの詳細化

開発環境では、Google API の生のエラー本文をログに出力すると原因特定が容易になる。

---

## 4. 参照

- [Custom Search JSON API - cse.list](https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list)
- Railway CLI: `railway logs --service api --lines 200 --filter "Image search" --json`
