import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = join(import.meta.dirname, "../..");

/** Reads a wrangler config (`wrangler.jsonc` by default), whose comments sit on their own lines. */
function readWranglerConfig(file = "wrangler.jsonc"): Record<string, unknown> {
  const text = readFileSync(join(appRoot, file), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(text) as Record<string, unknown>;
}

describe("development mode in the Worker config", () => {
  it("is not switched on by the deployable wrangler config", () => {
    // 開発モードは、サインインした誰もが大量のページを一括投入できる入口を開くため、
    // デプロイされる設定では有効にしない。
    // Development mode lets any signed-in user insert pages in bulk, so a deployed config must
    // never turn it on.
    const config = readWranglerConfig();
    const envs = Object.values((config.env ?? {}) as Record<string, Record<string, unknown>>);
    for (const scope of [config, ...envs]) {
      const vars = (scope.vars ?? {}) as Record<string, unknown>;
      expect(vars.ENVIRONMENT).not.toBe("development");
    }
  });

  it("leaves the test IdP out of production", () => {
    // テスト用 IdP は本物の Google を通さずにアカウントを作れるので、本番に入れてはいけない。
    // The test IdP mints accounts without Google, so production must never be able to reach it.
    const config = readWranglerConfig();
    const production = ((config.env ?? {}) as Record<string, Record<string, unknown>>).production;
    expect(production).toBeDefined();
    expect(production?.services).toEqual([]);
    expect(JSON.stringify(production)).not.toContain("TEST_IDP");
    expect((production?.vars ?? {}) as Record<string, unknown>).not.toHaveProperty("ENVIRONMENT");
  });

  it("is switched on for local runs through .dev.vars", () => {
    const example = readFileSync(join(appRoot, ".dev.vars.example"), "utf8");
    expect(example).toMatch(/^ENVIRONMENT=development$/m);
  });
});

describe("the test IdP Worker config", () => {
  it("gives the test IdP no public URL or route", () => {
    // テスト用 IdP のトークンとユーザー情報の窓口は、アプリの TEST_IDP バインディングからだけ呼べる前提。
    // 認可コードを期限まで再交換できても安全なのは、この窓口が外から届かないことに頼っている。
    // The token and userinfo endpoints must be reachable only over the app's TEST_IDP binding:
    // re-exchanging a code before it expires is safe only because nobody else can reach them.
    const config = readWranglerConfig("wrangler.test-idp.jsonc");
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
    const envs = Object.values((config.env ?? {}) as Record<string, Record<string, unknown>>);
    for (const scope of [config, ...envs]) {
      expect(scope.workers_dev ?? false).toBe(false);
      expect(scope.preview_urls ?? false).toBe(false);
      expect(scope).not.toHaveProperty("route");
      expect(scope).not.toHaveProperty("routes");
    }
  });
});
