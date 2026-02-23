/**
 * DB クライアント テスト
 */
import { describe, it, expect } from "vitest";
import { createDb } from "../client";

describe("createDb", () => {
  it("環境変数から正しく初期化される", () => {
    const db = createDb({
      AURORA_CLUSTER_ARN: "arn:aws:rds:ap-northeast-1:123456789012:cluster:zedi-dev-cluster",
      DB_CREDENTIALS_SECRET:
        "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:zedi-dev-db",
      AURORA_DATABASE_NAME: "zedi",
    });
    expect(db).toBeDefined();
  });

  it('AURORA_DATABASE_NAME を省略するとデフォルト "zedi" が使われる', () => {
    const db = createDb({
      AURORA_CLUSTER_ARN: "arn:aws:rds:ap-northeast-1:123456789012:cluster:zedi-dev-cluster",
      DB_CREDENTIALS_SECRET:
        "arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:zedi-dev-db",
    });
    expect(db).toBeDefined();
  });
});
