# Jest 最小 bootstrap

`bootstrap_needed: true` かつ `test_runner: jest` のとき、ユーザー承認後に適用。

## 1. 依存

```bash
npm install -D jest @types/jest ts-jest
```

React: `@testing-library/react`, `@testing-library/jest-dom`, `jest-environment-jsdom`

## 2. jest.config.js（TypeScript 例）

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.(test|spec).(ts|tsx)"],
};
```

## 3. package.json scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:coverage": "jest --coverage"
  }
}
```

## 4. 配置

- colocated: `foo.ts` + `foo.test.ts`
- `__tests__/`: `src/__tests__/foo.test.ts`

## 5. smoke テスト

```typescript
describe("bootstrap", () => {
  it("runs the test runner", () => {
    expect(true).toBe(true);
  });
});
```

## 6. spec-test

smoke 通過後、P0 対象で spec-test を実行。
