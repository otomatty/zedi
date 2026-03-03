# PR #178 レビュー対応計画

> 作成日: 2026-03-03  
> 対象: [Merge develop into main: Production environment ready #178](https://github.com/otomatty/zedi/pull/178)  
> レビュアー: CodeRabbit, Copilot, Gemini Code Assist

---

## 概要

レビュー指摘を優先度・影響度で分類し、対応方針を整理する。PR #178 は既にマージ済みのため、本ドキュメントの修正は後続 PR で実施する。

---

## P0: クリティカル（即時対応推奨）

### 1. S3/DB 削除順序の逆転（media.ts, thumbnail/serve.ts）

**指摘**: DB レコードを先に削除してから S3 を削除しているため、S3 削除失敗時に孤児オブジェクトが残る。

**現状**:

- `media.ts` L127–139, `thumbnail/serve.ts` L101–113: `db.delete` → `s3.send(DeleteObjectCommand)`

**対応**: S3 削除を先に実行し、成功した場合のみ DB を削除する。

```ts
// 修正後の流れ
try {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: row.s3Key }));
} catch (err) {
  console.error("[media] S3 DeleteObject failed:", err);
  throw new HTTPException(502, { message: "Failed to delete object from storage" });
}
await db.delete(media).where(eq(media.id, mediaId));
```

**対象ファイル**:

- `server/api/src/routes/media.ts`
- `server/api/src/routes/thumbnail/serve.ts`

---

### 2. syncAiModels: 空リスト時の全モデル非アクティブ化

**指摘**: プロバイダ API が 200 で空リストを返した場合、`activeIds.length === 0` の else 分岐でそのプロバイダの全モデルが `isActive: false` になる。

**現状**: L556–567 で `rows.length === 0` のとき `where(eq(aiModels.provider, provider))` による一括非アクティブ化を実行。

**対応**: `rows.length === 0` かつ `fetchedTotal === 0` の場合は非アクティブ化をスキップする。

```ts
if (activeIds.length === 0 && fetchedTotal === 0) {
  console.warn(`[syncAiModels] ${provider} returned 0 models; skipping deactivation`);
} else if (activeIds.length > 0) {
  // 既存の notInArray による部分非アクティブ化
  ...
} else {
  // rows は空だが fetchedTotal > 0 の場合は API フィルタで全除外された可能性
  // この場合の挙動は要検討（現状どおり全非アクティブ化を維持するか、スキップするか）
  ...
}
```

**対象ファイル**: `server/api/src/services/syncAiModels.ts`

---

## P1: セキュリティ・データ整合性（早期対応推奨）

### 3. Terraform: 機密変数の default 値削除

**指摘**: `api_railway_verify_txt`, `realtime_railway_verify_txt` に平文の検証トークンが default で埋め込まれている。

**対応**:

- `variables.tf` から両変数の `default` を削除
- `terraform.tfvars.example` にプレースホルダを記載
- `docs/guides/terraform-cloudflare-prerequisites.md` 等で Terraform Cloud 変数または `TF_VAR_*` での設定を案内

**対象ファイル**: `terraform/cloudflare/variables.tf`

---

### 4. commitService: BETTER_AUTH_URL の必須化

**指摘**: `process.env.BETTER_AUTH_URL ?? ""` により、未設定時に相対 URL が返り不正な `imageUrl` になる。

**対応**: `getEnv("BETTER_AUTH_URL")` を使用し、未設定時は起動時にエラーとする。

```ts
const baseUrl = getEnv("BETTER_AUTH_URL").replace(/\/$/, "");
return { imageUrl: `${baseUrl}/api/thumbnail/serve/${objectId}` };
```

**対象ファイル**: `server/api/src/services/commitService.ts`

---

### 5. Drizzle journal: 0002 マイグレーションの登録

**指摘**: `0002_seed_ai_tier_budgets.sql` が `_journal.json` に含まれていない。

**対応**: `entries` に 0002 用のエントリを追加。

```json
{
  "idx": 1,
  "version": "7",
  "when": <適切なタイムスタンプ>,
  "tag": "0002_seed_ai_tier_budgets",
  "breakpoints": false
}
```

**対象ファイル**: `server/api/drizzle/meta/_journal.json`

---

### 6. IndexedDBStorageAdapter: resetDatabase の失敗時ハンドリング

**指摘**: `pageIds` 取得に失敗しても catch で握りつぶし、成功として resolve している。

**対応**: 列挙失敗時は `throw` して呼び出し元に伝播させる。

```ts
} catch (error) {
  throw new Error(
    "IndexedDBStorageAdapter: failed to enumerate page IDs; aborting reset to avoid partial cleanup.",
    { cause: error as Error },
  );
}
```

**対象ファイル**: `src/lib/storageAdapter/IndexedDBStorageAdapter.ts`

---

## P2: 機能バグ・一貫性（対応推奨）

### 7. useWikiLinkStatusSync: skipSync 時の実行中タスク中断

**指摘**: `skipSync` が true になっても、すでに `checkExistence` 完了後の `applyWikiLinkUpdates` や `onChange` が実行される可能性がある。

**対応**: `cancelled` フラグを導入し、各 `await` 直後および副作用の直前にチェックする。

```ts
useEffect(() => {
  let cancelled = false;
  // ...
  const updateWikiLinkStatus = async () => {
    if (cancelled) return;
    // ...
    const { pageTitles, referencedTitles } = await checkExistence(titles, pageId);
    if (cancelled) return;
    const updates = collectWikiLinkUpdates(...);
    if (cancelled) return;
    // ...
    if (updates.length > 0) {
      applyWikiLinkUpdates(editor, updates);
      if (cancelled) return;
      onChange(json);
    }
  };
  const timer = setTimeout(() => void updateWikiLinkStatus(), 150);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}, [...]);
```

**対象ファイル**: `src/components/editor/TiptapEditor/useWikiLinkStatusSync.ts`

---

### 8. inspect-ai-models-cost: baseline が Infinity になる問題

**指摘**: `positiveInputs` が空のとき `Math.min(...[])` が `Infinity` になり、`minInput > 0` は true のまま `baseline = Infinity` になる。

**対応**: 空配列を先にチェックする。

```ts
const positiveInputs = rows.map((r) => r.inputCostUnits).filter((v) => v > 0);
const baseline = positiveInputs.length > 0 ? Math.min(...positiveInputs) : 1;
```

**対象ファイル**: `server/api/scripts/inspect-ai-models-cost.ts`

---

### 9. syncAiModels findPricing: 誤マッチの防止

**指摘**: `mapKey.startsWith(key + "-")` により、`gpt-4o` が `gpt-4o-mini` にマッチして安い価格が割り当てられる。

**対応**: ハイフン後のサフィックスが数字で始まる場合のみ許容（バージョン日付想定）。

```ts
if (mapKey.startsWith(`${key}/`)) return pricing;
if (mapKey.startsWith(`${key}-`)) {
  const suffix = mapKey.slice(key.length + 1);
  if (/^\d/.test(suffix)) return pricing; // バージョン番号のみ
}
```

**対象ファイル**: `server/api/src/services/syncAiModels.ts`

---

### 10. S3Provider deleteImage: baseUrl パス対応

**指摘**: `baseOrigin` のみ使用しているため、`baseUrl` にパスが含まれる（例: `https://api.example.com/v1`）場合に削除 API の URL が不正になる可能性。

**対応**: fetch のベース URL に `base`（full baseUrl）を使用する。

```ts
const parsed = new URL(url, base);
const baseForFetch = base; // パス込みの baseUrl
// ...
const res = await fetch(`${baseForFetch}/api/media/${mediaId}`, { ... });
```

**補足**: 現在の典型的な構成（`baseUrl` が `https://api.zedi-note.app` の形式）では問題ないが、パス付き API を想定する場合は修正が必要。

**対象ファイル**: `src/lib/storage/providers/S3Provider.ts`

---

### 11. useStorageActions: cloudflare-r2 正規化

**指摘**: `storageContext` が `effectiveProvider === "s3"` のみチェックしており、legacy `cloudflare-r2` の場合に `getToken` が渡らず削除が失敗する。

**対応**: `getStorageProvider` と同様に `cloudflare-r2` → `s3` に正規化してから `storageContext` を構築する。

```ts
const normalizedProvider = effectiveProvider === "cloudflare-r2" ? "s3" : effectiveProvider;
const storageContext = useMemo(
  () => (normalizedProvider === "s3" && getToken ? { getToken } : undefined),
  [normalizedProvider, getToken],
);
```

**対象ファイル**: `src/components/editor/TiptapEditor/useStorageActions.ts`

---

## P3: UX・アクセシビリティ・ドキュメント

### 12. SubscriptionManagement: アクセシビリティ・不明ステータス

**指摘**:

- 戻るボタンに `aria-label` がない
- 未知の `status` を `"active"` として表示している

**対応**:

- `Button` に `aria-label={t("common.back")}` を付与
- 未知ステータス用に `statusUnknown` を i18n に追加し、`default` を `"unknown"` 相当の表示に変更
- `statusVariant` の default を `"secondary"` にして、明示的な `"active"` のみ `"default"` にする

**対象ファイル**: `src/pages/SubscriptionManagement.tsx`, `src/i18n/locales/*/common.json`, `src/i18n/locales/*/pricing.json`

---

### 13. aiCostUtils: 0.00x 表示の回避

**指摘**: `ratio` が 0.001〜0.004 のとき `toFixed(2)` で `"0.00x"` になる。

**対応**: `ratio < 0.01` の場合は `<0.01x` にクランプする（既存の 0.001 未満の分岐に合わせて拡張）。

```ts
if (ratio >= 0.01) return `${ratio.toFixed(2)}x`;
return ratio < 0.001 ? "<0.01x" : "<0.01x"; // 0.001 <= ratio < 0.01 も <0.01x
```

**対象ファイル**: `src/lib/aiCostUtils.ts`

---

### 14. ドキュメント修正（terraform-cloudflare-import, railway-next-steps 等）

**指摘**:

- `terraform-cloudflare-import.md`: 環境変数 `CLOUDFLARE_*` と Terraform 変数 `cloudflare_*` の使い分けが曖昧
- `railway-next-steps.md`: CI シークレット名が `PROD_*` のまま（実際は `DATABASE_URL` 等）
- `production-setup-procedure.md`: `git push origin main` 直接を推奨している記載を PR ベースに変更

**対応**: 各ドキュメントを現行ワークフロー・変数名に合わせて更新する。

**対象ファイル**:

- `docs/guides/terraform-cloudflare-import.md`
- `docs/specs/railway-next-steps.md`
- `docs/production-setup-procedure.md`
- `docs/specs/railway-remaining-tasks.md` (API_INTERNAL_URL 等)
- `docs/guides/terraform-cloudflare-prerequisites.md` (トークン分離推奨)
- `docs/specs/polar-setup.md` (最小スコープ推奨)

---

## P4: 改善提案・nitpick（余裕があれば対応）

### 15. .gitignore: .terraform.lock.hcl の追跡

**指摘**: `.terraform.lock.hcl` を gitignore するとプロバイダバージョンが環境ごとにずれる可能性がある。

**対応**: `.terraform.lock.hcl` を gitignore から除外し、リポジトリで管理する。

---

### 16. その他

- **usePageEditorState**: リセット処理の共通化（`resetEditorState` 抽出）
- **deploy-dev.yml / deploy-prod.yml**: `concurrency` で並列実行を抑制
- **subscriptionManage.ts**: `getEnv` の一貫利用、キャンセル前の状態チェック
- **aiSettings.json modelsEmpty**: ユーザー向けメッセージの簡略化

---

## 実施順序案

| Phase       | 内容                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------- |
| **Phase 1** | P0 の 1, 2（S3/DB 削除順序、syncAiModels 空リスト対策）                                   |
| **Phase 2** | P1 の 3〜6（Terraform 機密、commitService、journal、IndexedDB）                           |
| **Phase 3** | P2 の 7〜11（useWikiLinkStatusSync、inspect、findPricing、S3Provider、useStorageActions） |
| **Phase 4** | P3, P4（UX、ドキュメント、その他）                                                        |

---

## 注意事項

- Railway 検証 TXT の `railway-verify=railway-verify=` 二重プレフィックスは、Railway ドキュメントで正しいフォーマットを確認してから修正すること。
- スキーマ変更（`thumbnail_objects.user_id` FK、`account` unique 等）はマイグレーション追加が必要なため、別 PR で計画することを推奨。
