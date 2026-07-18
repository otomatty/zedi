# Scalability Requirements — api-worker

前提: business-logic-model.md / business-rules.md は infra スコープにより未作成。requirements.md と Workers プラットフォーム特性から導出する。

## スケーリングモデル

- SC-1: HTTP 処理は Workers のエッジ自動スケールに委ねる。キャパシティプランニングは不要（サーバプロビジョニング概念が無いため）。
- SC-2: レート制限は論理キーごとに 1 つの Durable Object（`DurableObjectKvStore`、#1093 設計）。DO は単一スレッドだが、キー分割（IP/ユーザー単位）により集中ボトルネックにならない設計を維持する。

## スコープ上の制限

- SC-3: 本 Issue は dev 検証まで（Q1=A/DoD）。本番トラフィック規模での負荷検証・growth projection は prod 切替判断時（Out of Scope）に実施する。
- SC-4: DB 層のスケーラビリティは #1090（D1 + ノート単位 DO + ユーザーシャード）の設計事項であり、本書では扱わない。
