import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = join(import.meta.dirname, "../..");

/** Reads `wrangler.jsonc`, whose comments sit on their own lines. */
function readWranglerConfig(): Record<string, unknown> {
  const text = readFileSync(join(appRoot, "wrangler.jsonc"), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(text) as Record<string, unknown>;
}

describe("development mode in the Worker config", () => {
  it("is not switched on by the deployable wrangler config", () => {
    // 開発モードは未認証のマジックリンク受信箱を公開するため、デプロイされる設定では有効にしない。
    // Development mode exposes an unauthenticated magic-link outbox, so a deployed config
    // must never turn it on.
    const config = readWranglerConfig();
    const envs = Object.values((config.env ?? {}) as Record<string, Record<string, unknown>>);
    for (const scope of [config, ...envs]) {
      const vars = (scope.vars ?? {}) as Record<string, unknown>;
      expect(vars.ENVIRONMENT).not.toBe("development");
    }
  });

  it("is switched on for local runs through .dev.vars", () => {
    const example = readFileSync(join(appRoot, ".dev.vars.example"), "utf8");
    expect(example).toMatch(/^ENVIRONMENT=development$/m);
  });
});
