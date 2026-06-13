# レイヤー分類 / Layer Classification

パス・ファイル名・import から **浅く** 分類する。`spec-test/references/test-perspectives.md` §7 と対応。

## 分類表

| layer         | 典型パス                                | ファイル名                | 主な import                 |
| ------------- | --------------------------------------- | ------------------------- | --------------------------- |
| `pure`        | `lib/`, `utils/`, `helpers/`, `domain/` | `*Validator*`, `*Parser*` | 標準ライブラリのみ          |
| `unit`        | `services/`, `useCases/`                | `*Service.ts`             | DB/API 抽象                 |
| `hook`        | `hooks/`                                | `use*.ts`                 | react                       |
| `component`   | `components/`                           | `*.tsx`（Page 除く）      | react, testing-library 想定 |
| `route`       | `routes/`, `pages/`, `app/api/`         | `route.ts`, `*Handler*`   | HTTP framework              |
| `integration` | `__tests__/integration`                 | `*.integration.*`         | 複数モジュール              |
| `e2e`         | `e2e/`, `tests/e2e/`                    | `*.spec.ts`（playwright） | playwright                  |
| `unknown`     | 上記に当てはまらない                    | —                         | —                           |

## 言語別の調整

### Go

- `*_test.go` 隣接 → 既に colocated test
- `/internal/` → unit、`/cmd/` → integration 寄り

### Python

- `tests/unit/` vs `tests/integration/` パスを優先

### Rust

- `src/*.rs` → unit、`tests/*.rs` → integration

## inventory での使い方

- **P0 向き**: `pure`, `unit`（ease が高い）
- **P1**: `hook`, `route`（代表ケース）
- **P2**: `component`（TL 導入済み前提）
- **P3 / 後回し**: `e2e` の細分化（ジャーニーは 1 本から）
