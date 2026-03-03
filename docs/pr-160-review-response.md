# PR #160 レビュー対応方針

feat: s3 storage and thumbnail implementation に対するレビュー（Gemini Code Assist, CodeRabbit, Copilot）の検討結果と対応提案です。

---

## 1. セキュリティ（優先度高）

### 1.1 SVG の XSS リスク（Gemini - security-high）

**指摘**: `image/svg+xml` で SVG を配信すると、埋め込み JavaScript による XSS の可能性がある。

**対応案（推奨）**:

1. **シンプル**: サムネイル配信では SVG を許可しない
   - `mimeTypes` から `svg` を削除し、SVG は `image/jpeg` として扱う（または 415 Unsupported Media Type を返す）
2. **厳密**: SVG をアップロード時・保存前にサニタイズする（ライブラリ例: `svg-sanitizer`）
3. **代替**: SVG 配信時に `Content-Security-Policy: script-src 'none'` を付与

**推奨**: サムネイル用途では SVG は想定されにくいため、**案1（SVG を許可しない）** が実装コストとリスクのバランスが良い。

---

### 1.2 X-Content-Type-Options: nosniff（Gemini - security-medium）

**指摘**: レスポンスに `X-Content-Type-Options: nosniff` がないと、ブラウザが MIME スニッフィングにより XSS につながる可能性がある。

**対応**: `serve.ts` の Response ヘッダーに追加する。

```ts
headers: {
  "Content-Type": contentType,
  "Cache-Control": "private, max-age=3600",
  "X-Content-Type-Options": "nosniff",
},
```

---

### 1.3 クロスオリジン DELETE（CodeRabbit - Major）

**指摘**: `S3Provider.deleteImage` が `url` から取得した origin を信頼しており、異なるオリジンへ DELETE を送る可能性がある。

**対応**: 常に `this.baseUrl` 由来の origin を使い、`url` の origin が一致しない場合はエラーにする。

```ts
const base =
  this.baseUrl.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
if (!base) throw new Error("API base URL is not configured");

const baseOrigin = new URL(base).origin;
const parsed = new URL(url, base);
if (parsed.origin !== baseOrigin) {
  throw new Error("異なるオリジンのURLは削除できません");
}
// mediaMatch / thumbMatch では parsed.pathname を使い、
// fetch では `${baseOrigin}/api/...` を使用
```

---

### 1.4 GET /api/media/:id の所有者チェック（Gemini）

**指摘**: 現状 `media` の存在確認のみで、所有者チェックがない。他人のメディアを `authRequired` のトークンだけで取得できる可能性がある。

**対応**: `GET /api/media/:id` に `row.ownerId === userId` チェックを追加する。  
（署名付き URL を返す前に、所有者であることを確認）

---

## 2. データ整合性

### 2.1 削除の順序（Gemini, CodeRabbit）

**指摘**: S3 を先に削除すると、DB 削除失敗時に DB のみ残る（逆は S3 に孤立オブジェクトが残る）。

**対応方針**:

- **DB 先削除**を採用する（Gemini 案）。S3 の孤立オブジェクトはライフサイクルポリシーやバッチで後から消せる。
- `media.ts` および `thumbnail/serve.ts` の DELETE ハンドラで、DB 削除 → S3 削除の順に変更する。

---

### 2.2 S3 GetObject / DeleteObject のエラーハンドリング（Copilot, CodeRabbit）

**指摘**:

- `GetObjectCommand`: S3 側のエラー（NoSuchKey など）で 500 になる。404 相当の扱いにすべき。
- `DeleteObjectCommand`: 未捕捉の例外でハンドラが落ちる。

**対応**:

- GetObject: `try/catch` で、`NoSuchKey` / `$metadata.httpStatusCode === 404` の場合は 404 を返し、それ以外は 502 を返す。
- DeleteObject: `try/catch` で捕捉し、失敗時は 502 を返してログ出力。

---

## 3. コード品質

### 3.1 ImageNodeView の isAuthRequiredUrl（Copilot, CodeRabbit）

**指摘**: `src.includes("/api/thumbnail/")` だと `/api/thumbnail/image-search` もマッチしてしまう。

**対応**: `/api/thumbnail/serve/` に限定する。

```ts
const isAuthRequiredUrl =
  src != null && (src.includes("/api/media/") || src.includes("/api/thumbnail/serve/"));
```

---

### 3.2 useStorageActions の effectiveProvider 依存（CodeRabbit）

**指摘**: `handleDeleteFromStorage` の `useCallback` の依存配列に `effectiveProvider` が含まれておらず、プロバイダ切り替え時に古い値が使われる。

**対応**: 依存配列に `effectiveProvider` を追加する。

```ts
[isStorageConfigured, storageSettings, toast, storageContext, effectiveProvider],
```

---

### 3.3 S3Provider の deleteImage 重複（Gemini）

**指摘**: `/api/media/` と `/api/thumbnail/serve/` の処理が似ており、重複している。

**対応**: 正規表現と処理を共通化してリファクタする。優先度は低めで、時間があれば実施。

---

### 3.4 serve.ts の mimeTypes を定数化（Gemini）

**指摘**: `mimeTypes` がリクエストごとに生成されている。

**対応**: ハンドラ外で定数として定義する。

---

### 3.5 STORAGE_ENDPOINT の取得方法（CodeRabbit）

**指摘**: `process.env.STORAGE_ENDPOINT` を直接参照しており、`getEnv` と揃っていない。

**対応**: `media.ts` と `thumbnail/serve.ts` で `getEnv("STORAGE_ENDPOINT")` を使う。  
※ `commitService.ts` でも同様に修正する。Cloudflare R2 / Railway Bucket 利用時は endpoint が必須の前提で問題ない。

---

### 3.6 commitService のコメント（Copilot）

**指摘**: 「presigned URL を返す」とあるが、実際にはプロキシストリーミングしている。

**対応**: コメントを実装に合わせて修正する。

```ts
// バケット非公開のため、API 経由でプロキシストリーミングする URL を返す
```

---

## 4. ドキュメント

### 4.1 見出し番号の重複（Gemini, CodeRabbit）

**指摘**: `### 3.3 クエリのサニタイズ` が既存の `### 3.3 検索エンジン設定の確認` と重複している。

**対応**: 「クエリのサニタイズ」を `### 3.4` に変更する。

---

### 4.2 コードブロックの言語指定（CodeRabbit）

**指摘**: コードブロックに言語指定がない（MD040）。

**対応**: 各ブロックに `text` や `log` 等の言語を指定する。

---

## 5. 対応の優先度まとめ

| 優先度 | 項目                         | 工数目安 |
| ------ | ---------------------------- | -------- |
| 高     | 1.1 SVG XSS                  | 小       |
| 高     | 1.2 X-Content-Type-Options   | 小       |
| 高     | 1.3 クロスオリジン DELETE    | 中       |
| 高     | 1.4 GET media 所有者チェック | 小       |
| 中     | 2.1 削除順序の変更           | 小       |
| 中     | 2.2 S3 エラーハンドリング    | 小       |
| 中     | 3.1 isAuthRequiredUrl        | 小       |
| 中     | 3.2 effectiveProvider 依存   | 小       |
| 低     | 3.3 deleteImage 共通化       | 中       |
| 低     | 3.4 mimeTypes 定数化         | 小       |
| 低     | 3.5 STORAGE_ENDPOINT getEnv  | 小       |
| 低     | 3.6 コメント修正             | 小       |
| 低     | 4.1, 4.2 ドキュメント        | 小       |

---

## 6. 実装しない/後回しの検討

- **2段階削除（soft-delete + バックグラウンドジョブ）**: 複雑になるため、まずは DB 先削除で対応し、運用で問題があれば検討。
- **cloudflare-r2 → s3 の正規化**: 既存設定への影響が大きいため、別 PR で検討。

---

## 7. 次のステップ

1. 上記「高」「中」の項目をこの PR または直後に実装する。
2. 「低」の項目は余裕があればまとめて対応する。
3. 実装後、該当ルートと S3Provider の動作確認を行う。
