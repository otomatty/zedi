# テストガイドライン

**テスト駆動開発（TDD）に合わせ、テストは実装の前に書くことを徹底する。** まず期待する振る舞いをテストで定義し、そのテストが通るように実装する。対象は**ルートに近い画面**・**カスタムフック**・**ユーティリティ／サービス**。目的は (1) **回帰防止**（振る舞いが変わったらテストが落ちる）、(2) **仕様の Living Documentation 化**（describe/it の名前とコメントで振る舞いを残す）。**テスト品質の指標は Mutation スコアを優先する**。カバレッジは 80% 以上を目標とするが、Mutation スコアが閾値（`stryker.config.mjs` の high/low/break）を満たすことを優先し、**必要なテストだけ**を書く。

- **Test-first**: 新規機能・修正では、実装コードを書く**前に**テストを書く。既存コードに後からテストを追加する場合も、可能な限り「期待する振る舞い」を先にテストで表現してから実装を触る。
- **Red → Green → Refactor**: テストを書いたら一度失敗（Red）を確認し、最小限の実装で通す（Green）。そのうえでリファクタする。

---

## 1. 命名と構成

- **describe / it**: **英語**で記述する。
- **日本語での説明**: テストの上または横の**コメント**に書く（仕様の意味やエッジケースなど）。
- **仕様との対応**: テストファイルの先頭、または各 describe の上に、該当する仕様・ドキュメントの**実際のファイルパス**をコメントで記載する。

例:

```ts
// 仕様: docs/plans/20260216/page-editor-testing-proposal.md
describe("PageEditorHeader", () => {
  // 表示: タイトル入力と lastSaved の有無
  describe("display", () => {
    it("renders title input and placeholder", () => { ... });
    it("shows 'saved at' when lastSaved is set", () => { ... });
  });
});
```

---

## 2. モックの境界（ベストプラクティス）

### 2.1 何をモックするか

| 層                                                          | モックするか | 理由                                                                       |
| ----------------------------------------------------------- | ------------ | -------------------------------------------------------------------------- |
| **認証**（`useAuth`, `getToken`）                           | する         | 単体テストで IdP を動かさない。サインイン状態を固定する。                  |
| **API / DB**（fetch, `createApiClient`）                    | する         | 高速・再現可能。ネットワーク／DB に依存しない。                            |
| **ルーター**（`useNavigate`, `useParams`, `useLocation`）   | 単体ではする | ルートを固定し、ナビゲーションの呼び出しをアサートする。                   |
| **子コンポーネント**（重い・依存が多い）                    | 任意         | 親の振る舞いだけをテストするときはモック。そうでなければ実レンダーでよい。 |
| **純粋ユーティリティ**（`lib/contentUtils`, `searchUtils`） | しない       | 実装をそのまま使う。単体でテストしやすい。                                 |

### 2.2 境界の引き方

- **単体テスト** = 対象は 1 ユニット（1 コンポーネント / 1 フック / 1 ユーティリティ）。その依存は**モック**し、そのユニットのロジックと I/O だけを検証する。
- **結合テスト** = 複数ユニットをまとめてテスト（例: コンポーネント + 実フック + モック API）。**外部境界**（認証・API・必要ならルーター）だけモックする。
- **E2E** = 実ブラウザ・実認証（または MockAuthProvider）・実 or テスト用バックエンド。アプリコードはモックしない。

目安: **「このテストで制御しないもの」の境界でモックする**（認証・ネットワーク・時間・ルーターなど）。アプリ内はなるべく実コードを使い、重い・不安定な依存がある部分だけモックする。

### 2.3 モックのやり方

- 認証・API・ルーターは **vi.mock("module")** でモックし、対象ユニットに単一で予測可能な実装を渡す。
- モックはテストファイル内か `src/test/mocks.ts`（例: `mockAuth`, `mockNavigate`）にまとめて再利用する。
- フック: `@testing-library/react` の `renderHook` を使い、フックの依存（`useAuth`、API クライアントなど）をモックする。
- コンポーネント: 重い子や外部ライブラリ（例: `formatTimeAgo`）をモックする。DOM や React 自体はモックしない。

### 2.4 やってはいけないこと

- **テスト対象モジュール自体**をモックしない。
- 単体テストで E2E のような長いユーザー操作を再現しない。1 つの振る舞いに絞る。
- 純粋関数や小さなユーティリティは、問題のあるグローバルがない限りモックせず、そのままテストする。

---

## 3. 何をテストするか

- **ルートに近い画面**: 主な流れ（例: `id === 'new'` 時のリダイレクト、子に渡す主要コールバック）。単体は 1 本〜少数にし、フルフローは E2E でカバーする。
- **カスタムフック**: 返り値と副作用（例: API が正しい引数で呼ばれる、状態更新）。認証と API はモックする。
- **ユーティリティ／サービス**: 純粋なロジックと分岐。I/O を呼ぶ場合はその I/O だけモックする。

**品質指標の優先順位: Mutation スコア > カバレッジ。** カバレッジは **80% 以上**を目標とするが、Mutation スコアが閾値を満たしているかをまず確認する。振る舞いを守る・重要なケースを残すテストだけを追加し、実装の細部だけを断言するテストは避ける。

---

## 4. Mutation testing（テスト品質の可視化） / Mutation testing (test quality visibility)

**Mutation スコアをテスト品質の第一指標とする。** Mutation testing は「コードを意図的に壊したときにテストが落ちるか」でテストの有効性を測る。Stryker + Vitest で導入済み。CI では PR 向けに**限定対象**で実行し、レポートを artifact で取得できる。  
Mutation testing measures test effectiveness by checking whether tests fail when code is intentionally broken. Stryker + Vitest are used. In CI, a **limited scope** runs per PR and reports are available as artifacts.

### 4.1 ローカルで再現するコマンド / Local commands

```bash
# 設定・依存の確認（mutation は実行しない）
bun run test:mutation:dry

# 単一ファイル（CI と同じ範囲）
bun run test:mutation -- --mutate "src/lib/dateUtils.ts"

# 複数ファイルをカンマ区切りで指定する例
bun run test:mutation -- --mutate "src/lib/dateUtils.ts,src/lib/searchUtils.ts"

# glob パターンでディレクトリを指定する例
bun run test:mutation -- --mutate "src/lib/**/*.ts"
```

レポートは `reports/mutation/mutation.html` に出力される。Reports are written to `reports/mutation/mutation.html`.

### 4.2 CI での対象拡張ルール（Phase 2） / CI scope expansion (Phase 2)

- **初期 / Initial**: `src/lib/dateUtils.ts` のみ。所要時間を計測してから拡張する。Only this file at first; measure duration before expanding.
- **段階拡張の順序 / Expansion order**（1〜2週間の実績を見てから / after 1–2 weeks of data）:
  1. `src/lib` の critical なユーティリティ（日付・検索・コンテンツ変換など） / critical utilities (date, search, content transform)
  2. `src/hooks` の純粋ロジック寄りの部分 / logic-heavy parts of hooks
  3. 全量は別 workflow（nightly）で実行する方針 / full run in a separate nightly workflow
- ジョブ時間が目標（+3〜8分）を超える場合は、`--mutate` の範囲を縮小する。If job time exceeds the target (+3–8 min), narrow the `--mutate` scope.
- 閾値（`thresholds.break`）は現状 65 のまま。ノイズが減った段階で引き上げを検討する。Keep `thresholds.break` at 65; consider raising it once noise is reduced.

### 4.3 初回運用後の調整 / Post–first-run adjustments

- **計測 / Measurement**: 初回 PR で **mutation-light** ジョブの実行時間を GitHub Actions の Summary で確認し、何分だったかを記録する（目標レンジ: +3〜8分）。On the first PR, check the **mutation-light** job duration in GitHub Actions Summary and record it (target: +3–8 min).
- **方針決定 / Decisions**: 記録した時間を基準に、次回の対象拡張や閾値変更を決める。Use that time to decide scope expansion and threshold changes.
  - 超過時 / If over target: `--mutate` の範囲を縮小するか、全量は nightly に移す。Narrow `--mutate` or move full run to nightly.
  - 余裕がある場合 / If within budget: 4.2 の順で対象を段階拡張する。Expand scope per 4.2.
- 安定後 / When stable: `continue-on-error` を外して merge blocking にするか検討する。Consider removing `continue-on-error` to make the job merge-blocking.

### 4.4 Nightly 全量実行（Phase 3） / Nightly full run (Phase 3)

- **workflow**: `.github/workflows/nightly-mutation.yml`
- **トリガー / Trigger**: 毎日 04:00 UTC（手動は Actions タブから "Nightly Mutation" → "Run workflow"）。Daily at 04:00 UTC; manual run via Actions → "Nightly Mutation" → "Run workflow".
- **対象 / Scope**: `stryker.config.mjs` の全対象（`src/lib/**/*`, `src/hooks/**/*`）。PR の軽量ジョブとは別に、ここで全量の mutation score を取得する。Full config scope; use this run for overall mutation score, separate from the PR light job.
- **レポート / Report**: artifact **mutation-report-nightly**（14 日保持）。週次でスコア推移・survived mutant 件数を確認する。Artifact retained 14 days; review score trend and survived mutant count weekly.
- **失敗時 / On failure**: workflow が失敗として表示される。Nightly は PR の merge には影響しないが、失敗時は Issue 化またはチーム合意の方法でトリアージする。Workflow shows as failed. Nightly does not block PR merge; triage failures via an Issue or team-agreed process.

---

## 5. 参照

- テストセットアップ: `src/test/setup.ts`
- 共通モック: `src/test/mocks.ts`
- ページエディタのテスト提案: `docs/plans/20260216/page-editor-testing-proposal.md`
- Mutation testing 段階導入: Issue #377
- 実行: `npx vitest run`（推奨）／E2E: `bun run test:e2e`／Mutation: `bun run test:mutation`
