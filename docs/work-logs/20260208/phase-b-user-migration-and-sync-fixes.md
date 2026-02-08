# 作業ログ: Phase B 既存ユーザー移行 および 同期まわり修正

**作業日:** 2026-02-08  
**対象:** 次のステップ作業計画書 Phase B（Clerk → Cognito ユーザー移行）、同期挙動の調整、Turso 将来方針の明記

---

## 1. サマリー

| # | 作業内容 | 成果物・変更 |
|---|----------|--------------|
| 1 | Phase B 実装状況の確認と移行対象ユーザー取得（B1） | 実装状況ドキュメント作成、Turso から Clerk user_id 一覧取得スクリプト作成・実行 |
| 2 | ユーザーマッピングの検討とメール紐づけ | マッピング方針（Gmail→Google Workspace 対応含む）の文書化、マッピング表作成 |
| 3 | Cognito sub 取得とマッピング表更新 | サインイン後の sub をマッピングに反映 |
| 4 | DB 更新スクリプトの作成と移行実行（B4・B5） | スクリプト作成、ドライラン・本実行で Turso の user_id 系を Cognito sub に更新 |
| 5 | 移行後 0 ページのままになる事象の修正 | ローカル 0 件時に全件取得するよう同期ロジックを追加 |
| 6 | 全件取得を「手動同期時のみ」に限定 | `syncWithRemote` にオプション追加、`triggerSync` 時のみ `forceFullSyncWhenLocalEmpty` を有効化 |
| 7 | Turso の AWS 移行後方針の明記 | `src/lib/turso.ts` に Phase C3（Turso→Aurora）への参照コメントを追加 |

---

## 2. 実施した作業の詳細

### 2.1 Phase B1: 移行対象ユーザー取得

- **実装状況ドキュメント:** `docs/work-logs/20260208/phase-b-implementation-status.md` を作成。Turso の user_id 参照箇所（pages, notes, note_pages, note_members）と Phase B タスク一覧を整理。
- **スクリプト:** `scripts/migration/list-clerk-users.ts` を作成。Turso から distinct user_id を取得し、テーブル別件数付きで出力。`--csv` / `--json` オプション対応。
- **実行結果（開発 DB）:** 移行対象 1 件。`user_37axfEra8z81aMdhOhBMcXMpWeU`（pages 1331, notes 3, note_pages 0, note_members 0）。一覧は `docs/plans/20260208/clerk-users-to-migrate.json` に保存。
- **npm スクリプト:** `migration:list-clerk-users`, `migration:list-clerk-users:csv`, `migration:list-clerk-users:json` を package.json に追加。

### 2.2 マッピング検討とメール紐づけ（B2・B3）

- **ドキュメント:** `docs/plans/20260208/user-migration-mapping.md` を作成・更新。
  - メールアドレスが変わる場合（Gmail → Google Workspace カスタムドメイン）も、移行後に使うアカウントでサインインした時の Cognito sub でマッピングすればよい旨を記載。
  - 紐づけ: 以前 **saedgewell@gmail.com**、移行後サインイン **akimasa.sugai@saedgewell.com**。
- **マッピング表（実ファイル）:**  
  - `docs/plans/20260208/clerk-to-cognito-mapping.json`  
  - `docs/plans/20260208/clerk_to_cognito_mapping.csv`  
  - 取得した Cognito sub: `b7f4ea38-3061-7040-ff13-e060a4b620f0` を記入済み。

### 2.3 B4: DB 更新スクリプト と B5: 移行実行

- **スクリプト:** `scripts/migration/update-user-ids-to-cognito.ts` を作成。
  - マッピング JSON を読み、`pages.user_id` / `notes.owner_user_id` / `note_pages.added_by_user_id` / `note_members.invited_by_user_id` を Clerk userId → Cognito sub に一括 UPDATE。
  - `--dry-run` で更新対象件数のみ表示、本実行で UPDATE。
- **実行:** ドライランで 1331 pages, 3 notes を確認後、本実行で移行完了。アプリでサインインし直すとクラウドのページ・ノートが取得できることを確認。
- **npm スクリプト:** `migration:update-user-ids`, `migration:update-user-ids:dry` を package.json に追加。

### 2.4 移行後も 0 ページのままになる事象の対応

- **原因:** 初回同期で 0 件だった際に lastSyncTime が保存され、以降は delta 同期（updated_at > lastSyncTime）のみになっていた。B4 で Turso の user_id は更新済みだが、既存行の updated_at は古いため delta では 0 件のまま。
- **対応（1）:** `src/lib/turso.ts` の `syncWithRemote` で、ローカルにこのユーザーのページが 0 件のときは syncSince = 0 として全件取得するように変更。
- **対応（2）:** 上記を「手動同期（同期ボタン）のときだけ」に限定。`syncWithRemote` に第 3 引数 `options?: { forceFullSyncWhenLocalEmpty?: boolean }` を追加し、`triggerSync` からだけ `forceFullSyncWhenLocalEmpty: true` を渡す。ページ読み込み時の自動同期では渡さず、従来どおり lastSyncTime ベースの delta のみ。

### 2.5 Turso の AWS 移行後方針

- **計画:** Phase C3 で DB を Turso → Aurora Serverless v2 に移行するため、AWS 移行後は Turso は使用しない。
- **コード:** `src/lib/turso.ts` のリモート DB 設定付近に、上記方針と参照ドキュメント（next-steps-work-plan.md §5 Phase C、implementation-status-and-roadmap.md §2）をコメントで追記。

---

## 3. 変更・追加したファイル一覧

| 種別 | パス |
|------|------|
| 新規 | `docs/work-logs/20260208/phase-b-implementation-status.md` |
| 新規 | `docs/plans/20260208/user-migration-mapping.md` |
| 新規 | `docs/plans/20260208/clerk-users-to-migrate.json` |
| 新規 | `docs/plans/20260208/clerk-to-cognito-mapping.json` |
| 新規 | `docs/plans/20260208/clerk_to_cognito_mapping.csv` |
| 新規 | `scripts/migration/list-clerk-users.ts` |
| 新規 | `scripts/migration/update-user-ids-to-cognito.ts` |
| 新規 | `docs/work-logs/20260208/phase-b-user-migration-and-sync-fixes.md`（本ログ） |
| 更新 | `src/lib/turso.ts`（SyncWithRemoteOptions、forceFullSyncWhenLocalEmpty、triggerSync のオプション渡し、Turso→Aurora コメント） |
| 更新 | `package.json`（migration:list-clerk-users 系、migration:update-user-ids 系） |
| 更新 | `docs/plans/20260208/next-steps-work-plan.md`（§8 進捗メモを Phase B 完了に更新） |

---

## 4. 次のステップとして行うべき作業

1. **Phase C の選択**
   - **C1 本番デプロイ:** 本番用 Cognito 環境変数・Terraform（prod.tfvars）を設定し、本番でアプリをデプロイする。
   - **C2 Phase 6（CDN）:** CloudFront + S3 でフロント配信を構築する（インフラ優先の場合）。
   - **C3 DB 移行（Turso → Aurora）:** アプリの接続先を Aurora Serverless v2 に切り替え、データ移行を実施する（別計画。アプリ変更・データ移行が必要）。
   - **C4 Hocuspocus 永続化:** Redis マルチインスタンス同期・Aurora 永続化（将来対応でよい）。

2. **本番デプロイ（C1）に進む場合の具体的タスク**
   - 本番用 `VITE_COGNITO_DOMAIN` / `VITE_COGNITO_CLIENT_ID` およびコールバック URL の設定。
   - `terraform/environments/prod.tfvars` で IdP とコールバック/ログアウト URL が設定済みなら、本番で `terraform apply` し、アプリをデプロイ。
   - 環境変数は `docs/guides/env-variables-guide.md` を参照。

3. **E2E の任意確認**
   - Phase A で E2E は MockClerkProvider のまま利用可能としている。必要に応じて `bun run test:e2e` でサインイン〜主要画面を確認。

---

## 5. 参照するべき作業計画書・ドキュメント

| ドキュメント | パス | 用途 |
|-------------|------|------|
| **次のステップ 作業計画書** | `docs/plans/20260208/next-steps-work-plan.md` | Phase A/B/C の全体像、Phase C のタスク一覧、進捗メモ。次は §5 Phase C および §8 を参照。 |
| **実装計画・現状サマリー** | `docs/plans/20260123/implementation-status-and-roadmap.md` | AWS 移行・リアルタイム編集の全体像、DB 移行（Turso→Aurora）の位置づけ。§2 AWS環境への移行 を参照。 |
| **Clerk→Cognito 移行調査** | `docs/plans/20260203/clerk-to-cognito-migration-investigation.md` | 既存ユーザー移行方針の詳細。§5.4 既存ユーザー移行・メール切り替え を参照。 |
| **移行ユーザーのマッピング検討** | `docs/plans/20260208/user-migration-mapping.md` | マッピングの考え方、メールが変わる場合の対応、マッピング表フォーマット。 |
| **環境変数ガイド** | `docs/guides/env-variables-guide.md` | 本番デプロイ時の環境変数設定。 |
| **Cognito IdP 設定ガイド** | `docs/guides/cognito-google-github-idp-setup.md` | Google/GitHub IdP の設定手順。 |

---

## 6. 補足

- Phase B は開発ユーザー 1 件を対象に B1〜B5 を実施済み。本番で複数ユーザーがいる場合は、同様に B1 で一覧取得 → 各ユーザーにサインインしてもらい sub 取得 → マッピング表作成 → B4 スクリプトで一括更新、の流れで実施する。
- 同期の「ローカル 0 件で全件取得」は、同期ボタン押下時のみ有効。新規端末では lastSyncTime が null のため従来どおり initial sync で全件取得される。
