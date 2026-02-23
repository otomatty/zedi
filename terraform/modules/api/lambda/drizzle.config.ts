import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // RDS Data API は drizzle-kit introspect/push で直接使えないため、
  // ローカル接続設定はダミー。CI/CD では Aurora への直接接続を設定する。
  // drizzle-kit generate でスキーマ差分チェック用途にのみ使う。
});
