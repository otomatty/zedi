# プロジェクト検出 / Project Detection

`test-inventory` Phase 1 と `spec-test` Phase 0 で共用する検出ルール。

## 1. 検出順序

1. ルートおよびスコープ配下の manifest を読む
2. テスト config ファイルの存在を確認
3. `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` の scripts・devDependencies を確認
4. CI 設定（`.github/workflows/*`）から test コマンドを補完
5. 既存 `*.test.*` / `*.spec.*` / `*_test.go` / `test_*.py` をサンプリング（最大 5 件）

## 2. Runner 判定

| シグナル                                                | 判定                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| `vitest.config.*` または devDependency `vitest`         | vitest                                                     |
| `jest.config.*` または devDependency `jest`             | jest                                                       |
| devDependency `mocha` + `chai`                          | mocha                                                      |
| `pyproject.toml` の `[tool.pytest]` または `pytest.ini` | pytest                                                     |
| `*_test.go` が多数、`go test` in Makefile/CI            | go test                                                    |
| `#[cfg(test)]` + `cargo test` in CI                     | cargo test                                                 |
| 複数共存                                                | スコープに最も近い config を優先。不明なら `OPEN QUESTION` |

## 3. Package manager 判定

| ファイル                  | manager    |
| ------------------------- | ---------- |
| `bun.lock` / `bun.lockb`  | bun        |
| `pnpm-lock.yaml`          | pnpm       |
| `yarn.lock`               | yarn       |
| `package-lock.json`       | npm        |
| `uv.lock` / `poetry.lock` | 該当ツール |
| なし（Go/Rust）           | go / cargo |

## 4. コマンド推定

`package.json` scripts を優先:

| script 名                                | 用途               |
| ---------------------------------------- | ------------------ |
| `test`, `test:run`, `test:unit`          | `test_run_command` |
| `test:coverage`, `coverage`              | `coverage_command` |
| `test:mutation`, `test:mutation:changed` | `mutation_command` |

script が無い場合のデフォルト（runner から生成）:

| runner     | test_run_command                          | coverage_command               |
| ---------- | ----------------------------------------- | ------------------------------ |
| vitest     | `npx vitest run` または `bunx vitest run` | 同左 + `--coverage`            |
| jest       | `npx jest`                                | `npx jest --coverage`          |
| pytest     | `pytest`                                  | `pytest --cov`                 |
| go test    | `go test ./...`                           | `go test -cover ./...`         |
| cargo test | `cargo test`                              | `cargo llvm-cov`（導入時のみ） |

**monorepo**: スコープ配下に別 `package.json` がある場合、**そのディレクトリを cwd** としてコマンドを組み立てる。

## 5. test_layout 判定

サンプルテスト 5 件の配置から多数決:

| パターン                         | layout      |
| -------------------------------- | ----------- |
| `src/foo.ts` + `src/foo.test.ts` | colocated   |
| `src/__tests__/foo.test.ts`      | `__tests__` |
| `tests/foo.test.ts`（src 外）    | `tests/`    |
| 混在                             | mixed       |

テスト 0 件の場合: overlay → `CONTRIBUTING` → 言語慣習（TS は colocated または `__tests__`）→ `unknown`。

## 6. Mutation 検出

| シグナル                                       | mutation |
| ---------------------------------------------- | -------- |
| `stryker.config.*` または `@stryker-mutator/*` | stryker  |
| `mutmut` in pyproject / requirements           | mutmut   |
| なし                                           | none     |

## 7. E2E 検出

| シグナル              | e2e_runner |
| --------------------- | ---------- |
| `playwright.config.*` | playwright |
| `cypress.config.*`    | cypress    |
| なし                  | none       |

## 8. bootstrap_needed

以下のいずれかで `true`:

- runner は推定できるが test script / config が無い
- devDependency に runner が無い
- スコープ内にテストファイルが 0 件かつユーザーが「未導入」と明示

## 9. project-profile フィールド

`spec-test` が消費する最小セット:

```yaml
project_profile:
  repo_root: .
  scope: src/lib
  test_runner: vitest
  package_manager: bun
  test_run_command: "bunx vitest run"
  coverage_command: "bun run test:coverage"
  test_layout: colocated
  setup_files: []
  example_test_paths: []
  mutation: stryker
  mutation_command: "bun run test:mutation:changed"
  mutation_threshold_high: 85
  e2e_runner: playwright
  bootstrap_needed: false
  overlay: null # e.g. zedi
  verification_level: A # A=stryker, B=coverage, C=checklist
```

`verification_level` は mutation の有無から自動設定:

- stryker + mutation_command → **A**
- coverage_command のみ → **B**
- runner のみ → **C**
