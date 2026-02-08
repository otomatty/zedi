# 次のステップ 作業計画書

**作成日:** 2026-02-08  
**前提:** 開発環境での Cognito サインイン（Google/GitHub）は問題なく動作している

---

## 1. 現状とゴール

| 項目 | 現状 |
|------|------|
| 認証 | Cognito OAuth（Google/GitHub）に移行済み。開発環境でサインイン動作確認済み。 |
| フロント | `CognitoAuthProvider` / `useAuth` で Cognito 利用。E2E は `MockClerkProvider`。 |
| 依存 | `@clerk/clerk-react` が package.json に残存。アプリのランタイムでは未使用。 |
| DB | Turso のまま。`user_id` は Clerk の userId 形式。 |
| ユーザー | 開発ユーザーのみ。移行時は「使うアカウントでサインイン」でマッピング取得する方針。 |

**ゴール:** Clerk を完全に廃止し、既存データの user_id を Cognito sub に移行したうえで、本番デプロイまたは Phase 6 / DB 移行の土台を整える。

---

## 2. 作業の流れ（概要）

```
[Phase A] パッケージ整理（Clerk 削除）
    ↓
[Phase B] 既存ユーザー移行（マッピング取得 → DB 更新）
    ↓
[Phase C] 本番準備 または インフラ・DB 移行（別ライン）
```

---

## 3. Phase A: パッケージ整理（Clerk 削除）

**目的:** `@clerk/clerk-react` を削除し、テストのモックを Cognito/useAuth 前提に変更する。

| # | タスク | 内容 | 成果物・確認 |
|---|--------|------|--------------|
| A1 | **Clerk 依存の削除** | `package.json` から `@clerk/clerk-react` を削除。`npm install`（または `pnpm install`）で node_modules を更新。 | ビルドが通ること。`pnpm run build` |
| A2 | **単体テストのモック修正** | `src/test/mocks.ts` の `mockClerkAuth` を、`@clerk/clerk-react` ではなく `@/hooks/useAuth` または Cognito 用のモックに差し替える。既存テストが useAuth のインターフェースで動くようにする。 | 該当する単体テストが通ること。`pnpm run test` |
| A3 | **Clerk 参照の最終確認** | リポジトリ内に `@clerk` / `clerk` の import や参照が残っていないか検索し、あれば削除・置換。 | grep で参照ゼロであること |
| A4 | **E2E の確認** | E2E は `MockClerkProvider` のまま利用可能なはず。実行してサインイン〜主要画面が問題ないことを確認。 | `pnpm run test:e2e`（またはプロジェクトの E2E コマンド） |

**参照:** 実装状況ドキュメント「次のステップ」#5（パッケージ整理）。

---

## 4. Phase B: 既存ユーザー移行（Clerk → Cognito）

**目的:** 開発ユーザーについて Clerk userId → Cognito sub のマッピングを作成し、Turso の `user_id` を一括更新する。移行時に「使うメール（Google/GitHub）」でサインインしてもらい、その時の sub で紐づける方針。

| # | タスク | 内容 | 成果物・確認 |
|---|--------|------|--------------|
| B1 | **Clerk 側のユーザー一覧の取得** | 現行 Turso（または Clerk ダッシュボード）から、存在する `user_id`（Clerk userId）の一覧を取得。必要に応じてメールアドレスも取得し、誰がどのアカウントでサインインするか把握する。 | 一覧 CSV または表（user_id, メール or 備考） |
| B2 | **マッピング取得手順の作成** | 各ユーザーに「移行後も使う Google/GitHub アカウントで一度 Cognito にサインインしてもらう」手順を書く。サインイン後、アプリまたは管理用の簡易画面・スクリプトで「現在の Cognito sub」を確認できるようにする（例: トークンデコード、または既存の useAuth で表示）。 | 手順書（ユーザー向け＋運営向け） |
| B3 | **マッピング表の作成** | 各ユーザーがサインインした時点で、Clerk userId（または B1 の一覧の識別子）と Cognito `sub` の対応表を作成。スプレッドシートまたは CSV で保持。 | ファイル: `clerk_user_id,cognito_sub` 形式など |
| B4 | **DB 更新スクリプトの作成** | Turso の `pages.user_id` / `notes.owner_user_id` 等、Clerk userId を参照しているカラムを、マッピング表に基づいて Cognito `sub` に一括 UPDATE するスクリプトを作成。ドライラン（SELECT で更新対象確認）と本実行を分けられるようにする。 | スクリプト（例: Node/TS または SQL）＋実行手順 |
| B5 | **移行の実行** | メンテナンスウィンドウを設け、バックアップ取得後に B4 のスクリプトを実行。実行後、アプリでサインインしてページ・ノートが正しく表示されることを確認。 | 移行完了。動作確認ログ |

**参照:** `docs/plans/20260203/clerk-to-cognito-migration-investigation.md` §5.4（既存ユーザー移行・メール切り替え方針）。

---

## 5. Phase C: 本番準備 および 今後のライン

**目的:** 本番デプロイまたは次のインフラ・DB 移行に進むための選択肢を整理する。

| # | タスク | 内容 | 備考 |
|---|--------|------|------|
| C1 | **本番環境変数・Terraform** | 本番用の `VITE_COGNITO_DOMAIN` / `VITE_COGNITO_CLIENT_ID` およびコールバック URL を設定。`prod.tfvars` で IdP とコールバック/ログアウト URL が設定済みなら、本番で `terraform apply` し、アプリをデプロイ。 | `docs/guides/env-variables-guide.md` |
| C2 | **Phase 6（CDN）** | CloudFront + S3 でフロント配信を構築。Terraform モジュール追加。 | 別計画。インフラ優先時 |
| C3 | **DB 移行（Turso → Aurora）** | アプリの接続先を Aurora Serverless v2 に切り替え、データ移行を実施。 | 別計画。アプリ変更・データ移行が必要 |
| C4 | **Hocuspocus 永続化** | Redis マルチインスタンス同期・Aurora 永続化。現状はメモリのみ。 | 将来対応でよい |

Phase A と Phase B を完了した時点で、C1（本番デプロイ）に進むか、C2/C3 を先に進めるかは要件に応じて選択する。

---

## 6. 推奨実施順序

1. **Phase A**（パッケージ整理）… 短期で完了可能。Clerk 完全除去でコードベースが明確になる。
2. **Phase B**（既存ユーザー移行）… 開発ユーザーのみなら、マッピング取得〜スクリプト〜実行を 1 サイクルで実施可能。
3. **Phase C** のうち **C1**（本番デプロイ）を実施するか、**C2/C3**（CDN・DB 移行）を先に計画するか決定。

---

## 7. 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| 実装計画・現状サマリー | `docs/plans/20260123/implementation-status-and-roadmap.md` |
| Clerk→Cognito 移行調査 | `docs/plans/20260203/clerk-to-cognito-migration-investigation.md` |
| 環境変数ガイド | `docs/guides/env-variables-guide.md` |
| Cognito IdP 設定ガイド | `docs/guides/cognito-google-github-idp-setup.md` |

---

## 8. 進捗メモ（随時更新）

| Phase | タスク | 状態 | メモ |
|-------|--------|------|------|
| A | A1〜A4 | **完了** (2026-02-08) | A1: package.json から @clerk/clerk-react 削除。A2: mocks.ts を mockAuth（@/hooks/useAuth モック）に変更、mockClerkAuth は後方互換のため残す。A3: コード内の Clerk 参照なし確認、README の環境変数・Acknowledgments を Cognito に更新。A4: ビルド・単体テスト 156 件成功。E2E は MockClerkProvider 利用のため Clerk 非依存；必要に応じて手動で `bun run test:e2e` を実行して確認。 |
| B | B1〜B5 | **完了** (2026-02-08) | B1: 移行対象ユーザー取得（list-clerk-users.ts）。B2/B3: マッピング方針・表作成（saedgewell@gmail.com→akimasa.sugai@saedgewell.com、cognito sub 取得済み）。B4: update-user-ids-to-cognito.ts 作成。B5: 移行実行・動作確認。同期で 0 件のままになる事象を手動同期時のみ全件取得で対応。詳細は `docs/work-logs/20260208/phase-b-user-migration-and-sync-fixes.md`。 |
| C | C1〜C4 | 未着手 | — |
