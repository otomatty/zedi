# CI Pipeline — Questions

質問なし（0 件）。

CI 方針は上流で確定済み: 品質ゲートは GitHub Actions 維持・デプロイは wrangler（cloudflare-zedi スキルのハイブリッド方針）、追加する検査は infrastructure-design/cicd-pipeline.md（bundle check の二重配置、test:worker）で設計済み、prod ワークフロー不作成（Q8=B）。code-generation/code-summary.md と build-and-test 成果物は infra スコープにより不在（expected）— CI 設計は既存の `ci.yml` / `deploy-api-worker-dev.yml` 実体と cicd-pipeline.md を正とする。
