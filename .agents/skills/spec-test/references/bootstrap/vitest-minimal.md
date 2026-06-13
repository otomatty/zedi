# Vitest 最小 bootstrap

`bootstrap_needed: true` かつ `test_runner: vitest` のとき、ユーザー承認後に適用する雛形。

## 1. 依存（例）

```bash
# npm
npm install -D vitest

# bun
bun add -d vitest
```

React コンポーネントをテストする場合は追加: `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`

## 2. vitest.config.ts（最小）

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node", // React なら "jsdom"
    include: ["**/*.{test,spec}.{ts,tsx}"],
  },
});
```

## 3. package.json scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

## 4. 初回テストの配置

- `test_layout: colocated` → `src/foo.ts` → `src/foo.test.ts`
- `test_layout: __tests__` → `src/__tests__/foo.test.ts`

## 5. 最初の smoke テスト

```typescript
import { describe, it, expect } from "vitest";

describe("bootstrap", () => {
  it("runs the test runner", () => {
    expect(true).toBe(true);
  });
});
```

実行: profile の `test_run_command`（設定後は `npx vitest run` 等）。

## 6. spec-test への引き継ぎ

smoke が通ったら削除または置換し、P0 対象で spec-test を実行する。
