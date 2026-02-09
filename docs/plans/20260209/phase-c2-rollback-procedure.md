# Phase C2 ロールバック手順書（Turso ↔ Aurora）

**作成日:** 2026-02-10  
**目的:** Aurora 移行後、不具合が発生した場合に Turso へ切り戻す手順を文書化する。  
**前提:** [phase-c2-work-log.md](phase-c2-work-log.md) / [turso-to-aurora-migration-decisions.md](20260208/turso-to-aurora-migration-decisions.md)

---

## 1. 方針

- **本番切り替え後も Turso は即廃止せず、読み取り専用でしばらく残す。**
- 問題発生時は「クライアントを Turso 接続に戻す」ことで切り戻し可能とする。
- Aurora 側のデータは、切り戻し時点では**削除しない**（再移行や調査に利用する場合があるため）。

---

## 2. ロールバックのトリガー

次のような場合にロールバックを検討する。

- Aurora または RDS Data API の障害・性能問題が解消見込みなし
- API（Lambda / API Gateway）の不具合でクライアントが正常に動作しない
- データ不整合が C2-7 検証や運用で発覚し、Aurora 側の修正が困難

---

## 3. 切り戻し手順（クライアントを Turso に戻す）

### 3.1 事前確認

- Turso の接続情報（`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`）が本番環境で有効であること。
- Turso は**読み取り専用**にしていないこと（切り戻し後は書き込みが必要）。読み取り専用にしていた場合は、Turso 側で書き込みを再度許可する。

### 3.2 クライアントの切り替え

1. **環境変数・ビルド設定**  
   - 本番ビルドで「Aurora 用 API 接続」ではなく「Turso 直結」を使うように切り替える。  
   - 例: 機能フラグ `USE_AURORA_API=true` を `false` に変更し、`turso.ts` のリモート接続を有効にする。  
   - または、Turso 接続を行う**旧バージョン（C3 移行前）のクライアント**をタグから再デプロイする。

2. **デプロイ**  
   - 上記設定でビルドし、本番環境にデプロイする。  
   - ユーザーには「一時的に旧仕様で接続しています」等の告知を検討する。

3. **動作確認**  
   - ログイン・ページ一覧・ページ編集・ノート一覧などが Turso に対して正常に動作することを確認する。

### 3.3 Aurora 側の扱い

- **即時には Aurora のデータを消さない**。再移行や原因調査に使う場合がある。
- 再移行を行う場合は、C2-1 から C2-5 の手順を再度実行する（その前に Aurora の該当テーブルを truncate するか、別 DB を使うかは別途判断）。

---

## 4. 再移行（Turso → Aurora を再度行う場合）

1. 原因の解消（Aurora / API の修正、またはインフラ変更）を実施する。
2. Aurora の既存データをどうするか決定する。  
   - 運用データが入っていない dev なら、`TRUNCATE ... CASCADE` でクリアしてから C2-2 以降を再実行してもよい。  
   - 本番で既にユーザーデータが入っている場合は、追い込みや差分移行の手順を別途検討する。
3. C2-1（Turso エクスポート）から順に実行し、C2-5（Aurora インポート）まで実施する。
4. C2-7（整合性検証）で件数一致を確認したうえで、再度クライアントを Aurora 用に切り替える。

---

## 5. 関連ドキュメント

| ドキュメント | 用途 |
|-------------|------|
| [phase-c2-work-log.md](phase-c2-work-log.md) | C2 作業ログ・成果物一覧 |
| [rearchitecture-task-breakdown.md](rearchitecture-task-breakdown.md) | C2-8 タスク定義 |
| [turso-to-aurora-migration-decisions.md](20260208/turso-to-aurora-migration-decisions.md) | 移行方針・Turso 読み取り専用で残す方針 |
| [import-to-aurora.mjs](../../scripts/migration/transform-for-aurora/import-to-aurora.mjs) | Aurora インポート（再移行時に使用） |

---

**以上、Phase C2 ロールバック手順書とする。**
