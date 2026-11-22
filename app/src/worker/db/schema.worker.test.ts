import { env } from "cloudflare:test";
import { is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { readD1Schema } from "./d1Schema";
import * as schema from "./schema";
import { describeDrizzleSchema, diffSchemas } from "./schemaParity";

describe("Drizzle schema matches the applied D1 migrations", () => {
  it("has no differences between schema.ts and migrations/*.sql", async () => {
    const tables = Object.values(schema).filter((value) => is(value, SQLiteTable));
    const diff = diffSchemas(describeDrizzleSchema(tables), await readD1Schema(env.DB));
    const instructions =
      "schema.ts と migrations/*.sql のどちらかを直す。適用済みのマイグレーションは書き換えず、新しいファイルを足す。";
    expect(diff, [instructions, ...diff].join("\n")).toEqual([]);
  });
});
