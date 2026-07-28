# Scalability Design — api-worker

前提: scalability-requirements.md（SC-1〜4）を実現する設計。business-logic-model.md は infra スコープにより未作成。

## ステートレス設計の維持（SC-1）

- Worker インスタンスに状態を持たない現行構成（状態は DB / KvStore / R2 に外部化済み）を維持する。本 Issue で新たな in-memory 状態を導入しない。
- ルート分割（LC-1）は登録の有無のみでスケーリング特性に影響しない。

## レート制限の分散設計（SC-2）

- `DurableObjectKvStore`（`src/lib/kv/doKvStore.ts`、`idFromName(key)` で論理キー毎に 1 DO）を無変更で使用。IP/ユーザー単位のキー分割により単一 DO へのホットスポットを避ける既存設計を踏襲。
- workerd テストで KvStore の 3 用途すべてが DO 経由で機能することを確認（SR-6 全数、FR-5.2）: `incrWithTtl`（レート制限固定ウィンドウカウンタ）、`getdel`（ext/MCP ワンタイムコードの原子消費）、`get`/`setex`（MCP 失効 deny-list）。

## スコープ外の明示（SC-3, SC-4）

- 負荷テスト・キャパシティ閾値・auto-scaling ルールは設定しない（Workers に該当概念がなく、prod 切替判断時に評価）。
- データ層のシャーディング設計は #1090。
