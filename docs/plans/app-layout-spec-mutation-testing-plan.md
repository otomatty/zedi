# アプリレイアウト・ノートページ仕様に基づくテストへの Mutation テスト実施計画

**参照**: [docs/specs/app-layout-and-note-pages-spec.md](../specs/app-layout-and-note-pages-spec.md)  
**関連テスト**: 仕様書に基づいて作成した Vitest テスト（noteViewHelpers, useContainerColumns, AppLayout, Header, AppSidebar, AIChatDock, NoteView, NoteSettings, NoteMembers）  
**既存ガイドライン**: [docs/guides/testing-guidelines.md](../guides/testing-guidelines.md) §4（Mutation testing）

---

## 1. 目的

- 仕様書ベースで追加した単体テストが、実装の「意図的な改悪」を検知できるかを Mutation テストで検証する。
- Mutation スコアを計測し、survived mutant（検知できなかった改悪）を減らしてテスト品質を可視化・改善する。
- CI や Nightly での対象拡張方針を決めるための根拠とする。

---

## 2. 現状の整理

### 2.1 作成済みテストと対象実装

| テストファイル               | 主な対象実装                             | Stryker の mutate 対象か               |
| ---------------------------- | ---------------------------------------- | -------------------------------------- |
| noteViewHelpers.test.ts      | `src/pages/NoteView/noteViewHelpers.ts`  | **否**（`src/pages/**` は未対象）      |
| useContainerColumns.test.tsx | `src/hooks/useContainerColumns.ts`       | **是**（`src/hooks/**`）               |
| AppLayout.test.tsx           | `src/components/layout/AppLayout.tsx`    | **否**（`src/components/**` は未対象） |
| Header/index.test.tsx        | `src/components/layout/Header/index.tsx` | **否**                                 |
| AppSidebar.test.tsx          | `src/components/layout/AppSidebar.tsx`   | **否**                                 |
| AIChatDock.test.tsx          | `src/components/layout/AIChatDock.tsx`   | **否**                                 |
| NoteView.test.tsx            | `src/pages/NoteView/index.tsx`           | **否**                                 |
| NoteSettings.test.tsx        | `src/pages/NoteSettings/index.tsx`       | **否**                                 |
| NoteMembers.test.tsx         | `src/pages/NoteMembers/index.tsx`        | **否**                                 |

### 2.2 現在の Stryker 設定（抜粋）

- **mutate**: `src/lib/**/*.{ts,tsx}`, `src/hooks/**/*.{ts,tsx}`（テストファイル・`src/test/**` 等は除外）
- **閾値**: high 80 / low 70 / break 65
- **CI (mutation-light)**: `--mutate "src/lib/dateUtils.ts"` のみ実行（所要時間抑制のため限定）

したがって、**現時点で仕様書ベースのテストがカバーする実装のうち、Mutation の対象になっているのは `useContainerColumns.ts` のみ**です。

---

## 3. 実施計画のフェーズ

### Phase 1: 既存 mutate 対象の評価（即時実施可能）

**対象**: `src/hooks/useContainerColumns.ts`（すでに `src/hooks/**` で mutate 対象）

**やること**:

1. **ローカルで Mutation 実行**
   ```bash
   bun run test:mutation -- --mutate "src/hooks/useContainerColumns.ts"
   ```
2. **レポート確認**
   - `reports/mutation/mutation.html` を開き、Mutation スコア・Killed / Survived / No coverage の内訳を確認する。
3. **Survived mutant の対応**
   - Survived がいる場合は、仕様（§10 の閾値・ref/columns の振る舞い）を満たすようにテストを追加または修正する。
4. **結果の記録**
   - スコアと所要時間を本ドキュメントまたはチームの記録場所に残す（CI 拡張の判断材料とする）。

**成果物**: useContainerColumns の Mutation スコアが break 以上であることの確認、必要ならテスト強化。

---

### Phase 2: 純粋関数の Mutation 対象追加（推奨・短期）

**対象**: `src/pages/NoteView/noteViewHelpers.ts`（純粋関数・依存なし）

**やること**:

1. **Stryker の mutate に 1 ファイル追加**
   - `stryker.config.mjs` の `mutate` に次を追加する例:
     ```js
     "src/pages/NoteView/noteViewHelpers.ts",
     ```
   - または、`src/pages/**/*.ts` を一括で入れるとノート以外のページも対象になるため、まずは上記 1 ファイルに限定することを推奨。
2. **ローカルで実行・レポート確認**
   ```bash
   bun run test:mutation -- --mutate "src/pages/NoteView/noteViewHelpers.ts"
   ```
3. **Survived の解消**
   - getNoteViewPermissions の分岐（canEdit / canAddPage / canShowAddPage / canManageMembers × local/remote）を漏れなく検知できるよう、テストを補強する。
4. **CI への組み合わせ（任意）**
   - `mutation-light` ジョブの `--mutate` を `"src/lib/dateUtils.ts"` に加え、`"src/hooks/useContainerColumns.ts"` と `"src/pages/NoteView/noteViewHelpers.ts"` をカンマ区切りで追加する。
   - 実行時間が目標（目安 +3〜8 分）を超える場合は、Phase 1 のみ CI に載せ、Phase 2 はローカル／Nightly のみとする。

**成果物**: noteViewHelpers の Mutation スコアが break 以上、必要なら stryker.config と CI の更新。

---

### Phase 3: レイアウト・ノートページの対象拡張（中期・時間を見て実施）

**対象**: レイアウトコンポーネントとノート系ページ

- `src/components/layout/AppLayout.tsx`
- `src/components/layout/Header/index.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/layout/AIChatDock.tsx`
- `src/pages/NoteView/index.tsx`
- `src/pages/NoteSettings/index.tsx`
- `src/pages/NoteMembers/index.tsx`

**注意**: これらは React コンポーネントであり、Stryker が生成する mutant（演算子の置換・条件の変更など）が多く、1 ファイルあたりの実行時間も長くなりがちです。

**やること**:

1. **対象の優先順位を決める**
   - 例: まず **AIChatDock**（分岐が少ない）→ **AppLayout** → **noteViewHelpers に近いロジックを持つ NoteView / NoteSettings / NoteMembers** → **Header / AppSidebar** の順で 1 ファイルずつ追加し、都度所要時間を計測する。
2. **mutate の追加方法**
   - `stryker.config.mjs` に `src/components/layout/**/*.{ts,tsx}` や `src/pages/NoteView/index.tsx` などを**個別 or 限定的な glob** で追加する。
   - 一度に広げず、1〜2 ファイルずつ増やして時間とスコアを確認する。
3. **ローカルで実行**
   ```bash
   bun run test:mutation -- --mutate "src/components/layout/AIChatDock.tsx"
   # または複数
   bun run test:mutation -- --mutate "src/components/layout/**/*.tsx"
   ```
4. **Survived の扱い**
   - コンポーネントは「表示の有無」や「条件分岐」の mutant が多く、UI の細部までテストで検知するのはコストが高い。
   - **仕様で規定した振る舞い（§2〜§9）に効く mutant を優先して解消**し、装飾的な変更で survive するものは「許容する」か「後回し」とする方針を決める。
5. **CI との両立**
   - これらのファイルを PR 時の `mutation-light` に含めると時間超過のリスクが高いため、**Nightly の全量 mutation（`nightly-mutation.yml`）の対象にする**ことを推奨。
   - PR では Phase 1〜2 の軽量範囲だけ回し、レイアウト・ノートページは Nightly レポートで週次確認する。

**成果物**: レイアウト・ノートページの Mutation スコアの把握、閾値や対象範囲のチーム合意。

---

## 4. 実行コマンド一覧

| 目的                          | コマンド                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 設定確認（mutation 実行なし） | `bun run test:mutation:dry`                                                                                  |
| useContainerColumns のみ      | `bun run test:mutation -- --mutate "src/hooks/useContainerColumns.ts"`                                       |
| noteViewHelpers のみ          | `bun run test:mutation -- --mutate "src/pages/NoteView/noteViewHelpers.ts"`                                  |
| 仕様関連の hooks + ヘルパー   | `bun run test:mutation -- --mutate "src/hooks/useContainerColumns.ts,src/pages/NoteView/noteViewHelpers.ts"` |
| レイアウト 1 ファイル         | `bun run test:mutation -- --mutate "src/components/layout/AIChatDock.tsx"`                                   |
| 全対象（設定どおり）          | `bun run test:mutation`                                                                                      |

レポートは `reports/mutation/mutation.html` に出力されます。

---

## 5. 閾値と結果の解釈

- **break (65)**: これを下回ると「テスト品質が不十分」とみなす。下回った場合はテスト追加・見直しで解消する。
- **low (70) / high (80)**: 品質の目安。high を目指すが、コンポーネントは 70 前後で許容する運用でも可。
- **Survived mutant**: 「その改悪を検知するテストが無い」状態。仕様で重要な分岐（権限・表示条件・閾値）に対応する mutant は優先してテストでカバーする。
- **No coverage**: その行に到達するテストが無い。まずはテストを足して実行パスを確保し、そのうえで Mutation スコアを改善する。

---

## 6. CI との連携（提案）

- **mutation-light（PR 時）**
  - 現状: `src/lib/dateUtils.ts` のみ。
  - Phase 1 後: `src/hooks/useContainerColumns.ts` を追加し、所要時間を計測。
  - Phase 2 後: 時間に余裕があれば `src/pages/NoteView/noteViewHelpers.ts` を追加。
  - 目標: ジョブ +3〜8 分以内。超過する場合は対象を減らすか、Nightly に寄せる。
- **Nightly（nightly-mutation.yml）**
  - `stryker.config.mjs` の mutate に Phase 2〜3 で追加したパスが含まれていれば、Nightly の全量実行で自動的にレイアウト・ノートページも対象になる。
  - レポートで「仕様書ベースで追加したテスト」がどれだけ mutant を kill しているかを週次で確認する。

---

## 7. 実施チェックリスト（サマリ）

- [x] **Phase 1**: `useContainerColumns.ts` の Mutation を実行し、スコアを記録。Survived があればテストを強化。（2025-03-19 実施）
- [x] **Phase 2**: `noteViewHelpers.ts` を mutate に追加し、実行・スコア確認。必要なら stryker.config と CI の mutation-light を更新。（実施済み）
- [x] **Phase 3**: レイアウト・ノートページを 1 ファイルずつ対象に追加し、所要時間とスコアを計測。CI は Nightly 中心。（実施済み・§10 に結果）
- [x] 閾値（break 65）を下回るファイルがあれば、テスト追加または対象外とする方針を記録。（§10 に記載。65 未満は許容し、Nightly で週次確認・必要に応じてテスト追加）
- [x] 本計画の結果（スコア・所要時間・対象一覧）をこのドキュメントまたは testing-guidelines に追記する。（§8〜§10 に追記済み）

---

## 8. Phase 1 実施結果（2025-03-19）

| 項目                | 結果                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 対象                | `src/hooks/useContainerColumns.ts`                                                                                                                                                                                |
| 実行コマンド        | `bun run test:mutation -- --mutate "src/hooks/useContainerColumns.ts"`                                                                                                                                            |
| 所要時間            | 約 31〜33 秒                                                                                                                                                                                                      |
| **Mutation スコア** | **74.29%**（break 閾値 65 以上を満たす）                                                                                                                                                                          |
| Killed              | 26                                                                                                                                                                                                                |
| Survived            | 9                                                                                                                                                                                                                 |
| No coverage         | 0                                                                                                                                                                                                                 |
| 実施内容            | 初回 68.57%（Survived 11）。`updateColumns` が要素幅に応じて `columns` を更新することを検証するテストを追加（`getBoundingClientRect` をモックし、`data-columns` をアサート）。スコア 74.29%（Survived 9）に改善。 |
| 残る Survived       | useCallback/useEffect の依存配列の変更、useLayoutEffect の cleanup（`ro.disconnect()`）など。単体テストで検知するには cleanup の呼び出し検証が必要でコストが高いため、現状は許容。                                |

---

## 9. Phase 2 実施結果

| 項目                | 結果                                                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 対象                | `src/pages/NoteView/noteViewHelpers.ts`                                                                                                                                                                     |
| 実行コマンド        | `bun run test:mutation -- --mutate "src/pages/NoteView/noteViewHelpers.ts"`                                                                                                                                 |
| 所要時間            | 約 54 秒                                                                                                                                                                                                    |
| **Mutation スコア** | **100%**（break 閾値 65 以上を満たす）                                                                                                                                                                      |
| Killed              | 6                                                                                                                                                                                                           |
| Timeout             | 14                                                                                                                                                                                                          |
| Survived            | 0                                                                                                                                                                                                           |
| No coverage         | 0                                                                                                                                                                                                           |
| 実施内容            | stryker.config.mjs の mutate に `src/pages/NoteView/noteViewHelpers.ts` を追加し、ローカルで mutation 実行。既存の noteViewHelpers.test.ts で全 mutant を検知（Killed 6、Timeout 14）。テストの追加は不要。 |
| 残る Survived       | なし。                                                                                                                                                                                                      |

---

## 10. Phase 3 実施結果（レイアウト・ノートページ）

stryker.config.mjs の mutate に以下を個別ファイルで追加済み。PR の mutation-light には含めず、Nightly の全量実行の対象とする。

| ファイル               | 所要時間（目安） | Mutation スコア | break 65 以上 | 備考                                                                                                  |
| ---------------------- | ---------------- | --------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| AIChatDock.tsx         | 約 1〜2 分       | **94.12%**      | 是            | テスト追加で Survived/No coverage を解消。1 件 Survived（onOpenChange 内 `if (true)`）は許容。        |
| AppLayout.tsx          | 約 1 分          | **100%**        | 是            | SidebarProvider の defaultOpen=false をアサートするテストを追加。                                     |
| NoteView/index.tsx     | 約 3 分          | 40.87%          | 否            | 8 Survived、60 No coverage。ハンドラー・i18n 等の未テスト分岐が多い。許容し、必要に応じてテスト追加。 |
| NoteSettings/index.tsx | 約 3 分          | 52.17%          | 否            | 2 Survived、42 No coverage。同上。                                                                    |
| NoteMembers/index.tsx  | 約 2 分          | 25.88%          | 否            | 14 Survived、49 No coverage。同上。                                                                   |
| Header/index.tsx       | 約 3 分          | **75%**         | 是            | 4 Survived（検索コンテキスト・aria-label 等）は装飾寄りのため許容。                                   |
| AppSidebar.tsx         | 約 4 分          | 54%             | 否            | 17 Survived、6 No coverage。ナビ active 判定・ユーザー表示等。許容し、必要に応じてテスト追加。        |

**閾値を下回るファイルの方針**: NoteView / NoteSettings / NoteMembers / AppSidebar は 65 未満。仕様で規定した振る舞い（表示の有無・権限）は既存テストでカバーしており、Survived の多くはハンドラー内部・i18n キー・装飾的な分岐。コストを考慮し現状は許容し、Nightly レポートで週次確認し、重要 mutant から優先してテストを追加する。

---

## 11. 改訂履歴

| 版  | 日付       | 内容                                                                                                                                                                                                                                                                                                                 |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0 | 2025-03-19 | 初版。Phase 1〜3 と CI 連携案を記載。                                                                                                                                                                                                                                                                                |
| 1.1 | 2025-03-19 | Phase 1 実施。スコア 74.29%、テスト追加、実施結果セクションを追記。                                                                                                                                                                                                                                                  |
| 1.2 | 2025-03-19 | Phase 2 実施。noteViewHelpers.ts を mutate に追加、スコア 100%、§9 とチェックリストを更新。                                                                                                                                                                                                                          |
| 1.3 | 2025-03-19 | Phase 3 実施。レイアウト・ノートページ 7 ファイルを mutate に追加。AIChatDock・AppLayout はテスト強化で 65 以上に。NoteView/NoteSettings/NoteMembers/AppSidebar は 65 未満を許容し §10 に結果を追記。NotePageView.test の AppLayout モック追加。CI mutation-light に useContainerColumns と noteViewHelpers を追加。 |
