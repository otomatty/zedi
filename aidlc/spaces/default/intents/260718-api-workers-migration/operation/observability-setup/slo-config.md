# SLO Config — api-worker (#1091)

前提: performance-design.md（PR-1: パリティ方針、数値目標なし）・reliability-design.md（RL-1: SLA/SLO 不設定）の確定記録。

## SLO

設定しない（意図的）。性能はパリティ基準（数値目標なし — Q2=A）、可用性は Railway 並行稼働が本番を担うため dev Worker に SLO は定義できない・しない。

## prod 切替時の入力

- 切替判断時に Railway 現行の実測（レイテンシ分布・エラー率）をベースラインとして採取し、SLO 初期値の根拠にする（performance-requirements.md PR-2 の「記録のみ」がその布石）。
