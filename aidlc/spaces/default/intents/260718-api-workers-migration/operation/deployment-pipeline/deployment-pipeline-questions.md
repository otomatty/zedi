# Deployment Pipeline — Questions

質問なし（0 件）。

CD 判断は全て確定済み: dev のみデプロイ（Q8=B）、既存 `deploy-api-worker-dev.yml` 維持 + デプロイ直前 bundle check 追加（ci-config.md / cicd-pipeline.md で設計済み）、ロールバック不要（RL-2: Railway 並行稼働が保険）、prod 切替・段階デプロイは Out of Scope。
