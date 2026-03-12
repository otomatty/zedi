# Prod Deploy Failure Triage — Cloudflare Pages 503 (2026-03-12)

## 1. Run evidence (記録)

### 対象 Run

- **Workflow**: [Deploy Production](https://github.com/otomatty/zedi/actions/runs/22983934171)
- **Trigger**: Push to `main` (merge of PR #311), commit `9cdd2f337888592643c84eba0e3deee32dfd0eda`
- **Date**: 2026-03-12

### ビルドは成功している

- **Run Database Migrations**: 成功
- **Deploy Frontend**: ステップ「Install & Build」まで成功（`vite build` 完了、`dist/` 生成済み）
- **Deploy Admin**: ステップ「Install & Build Admin」まで成功（`admin/dist/` 生成済み）

失敗はどちらも **Cloudflare Pages デプロイ**（`cloudflare/wrangler-action@v3` 実行時）のみ。

### Deploy Frontend の wrangler 実エラー

- **メッセージ**: `Received a malformed response from the API`
- **詳細**: `no healthy upstream`
- **HTTP**: `GET /accounts/***/pages/projects/zedi -> 503 Service Unavailable`
- **Wrangler**: 4.71.0（ログ出力先: `/home/runner/.config/.wrangler/logs/wrangler-2026-03-12_02-32-44_205.log`）

### Deploy Admin の wrangler 実エラー

- **メッセージ**: `Received a malformed response from the API`
- **詳細**: `upstream connect error or disconnect/reset before headers. reset reason: connection termination`
- **HTTP**: `GET /accounts/***/pages/projects/zedi-admin -> 503 Service Unavailable`
- **Wrangler**: 4.71.0

両ジョブとも、Pages API のプロジェクト取得（またはデプロイ前の取得）で 503 が返り、wrangler が終了コード 1 で落ちている。

---

## 2. Root cause classification（原因の切り分け）

### Cloudflare API 側要因が優勢である根拠

- **503 / no healthy upstream**: 認可や環境変数ミスでは通常 401/403 になる。503 は上流（Cloudflare の Pages バックエンド）の一時的な障害や負荷を示す。
- **同一 run 内で 2 プロジェクトが同時に 503**: `zedi` と `zedi-admin` が別ジョブでほぼ同時に同じ種の 503 を受けており、プロジェクト固有の設定不備より、プラットフォーム側の一時障害の方が説明しやすい。
- **過去の成功**: 同一ワークフローは 2026-03-10 に成功しており、ワークフロー・シークレット・プロジェクト設定の変更なしで再現している。
- **既知の事象**: Cloudflare Status や workers-sdk の Issue で、Pages API の 503 / "no healthy upstream" / "connection termination" は過去にも報告されており、Cloudflare 側のインシデントやバックエンド不調で発生することが知られている。

### 設定不備でない理由

- `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` が欠けている、または権限不足の場合は 401/403 が典型的。今回の 503 とは一致しない。
- 同一トークン・アカウントで 2 プロジェクトが同時に 503 であることから、トークン単体の問題より API の可用性の問題の方が自然。

---

## 3. 運用アクション（すぐに取るべき対応）

1. 同一コミットで「Re-run failed jobs」を実行し、自然復旧するか確認する。
2. 再発時は [Cloudflare Status](https://www.cloudflarestatus.com/) を同時刻で確認し、インシデント有無を記録する。
3. 失敗時に wrangler ログを artifacts で回収できるよう、ワークフローにログアップロード step を追加する（本 triage に合わせて実施）。

## 4. 恒久対策（実施内容）

- `deploy-prod.yml` の Cloudflare デプロイに **リトライ（`nick-fields/retry@v2`、最大 3 回、待機 60 秒）** を導入。一時的な Pages API 5xx（503 no healthy upstream 等）の緩和を想定。
- デプロイ失敗時に **wrangler ログを artifact（`wrangler-logs-frontend` / `wrangler-logs-admin`）としてアップロード** する step を追加。run で `$HOME/.config/.wrangler/logs/` をワークスペースにコピーしてから upload-artifact で相対パスを指定（upload-artifact の path は `$HOME` を展開しないため）。ログが無い／アップロード失敗時も `continue-on-error: true` により当該 step はジョブを止めない。
