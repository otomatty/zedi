# PostgreSQL コレーションバージョン不一致の解消

**目的:** Railway 上の PostgreSQL で `collation version mismatch` 警告が出る場合の対処。

## 現象

ログに以下のような警告が出る場合:

```text
WARNING:  database "zedi" has a collation version mismatch
DETAIL:  The database was created using collation version 2.41, but the operating system provides version 2.36.
HINT:  Rebuild all objects in this database that use the default collation and run ALTER DATABASE zedi REFRESH COLLATION VERSION, or build PostgreSQL with the right library version.
```

## 対処手順

1. Railway ダッシュボードで PostgreSQL サービスを開く。
2. **Connect** または **Variables** から `DATABASE_URL` を確認する（接続文字列）。
3. ローカルまたは Railway CLI から該当 DB に接続し、以下を実行する。DB 名が `zedi` でない場合は、接続中の DB 名（`SELECT current_database();` で確認可能）に置き換えてください。

```sql
ALTER DATABASE zedi REFRESH COLLATION VERSION;
```

4. （任意）ソート順・インデックスの一貫性を気にする場合は、必要に応じて:

```sql
REINDEX DATABASE zedi;
```

## 注意

- アプリケーションコードの変更は不要です。インフラ側の操作のみです。
- 実行後、アプリを再起動すると警告が消えます。
