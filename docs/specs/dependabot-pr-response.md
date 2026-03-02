# Dependabot PR 対応方針

**作成日**: 2026-03-01  
**対象**: 現在オープン中の Dependabot PR #131〜#140

**対応済み**: #134（react）, #138（@types/react）, #140（date-fns）。#140 はソース修正不要で v4 互換。React 19 利用時は `react-dom` / `@types/react-dom` を 19 に揃え、必要なら `@testing-library/dom` を追加すること（本文「PR #140 マージ後」参照）。

---

## 1. 現状サマリ

| PR                                                | パッケージ               | 変更                                                                      | リスク                   | 推奨                       |
| ------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------- | ------------------------ | -------------------------- |
| [#131](https://github.com/otomatty/zedi/pull/131) | minor-and-patch グループ | @anthropic-ai/sdk, lucide-react, next-themes, eslint-plugin-react-refresh | 低                       | **すぐマージ可**           |
| [#132](https://github.com/otomatty/zedi/pull/132) | zod                      | 3.25.76 → 4.3.6                                                           | 高（API変更）            | 後述の「メジャー束」で対応 |
| [#133](https://github.com/otomatty/zedi/pull/133) | react-resizable-panels   | 2.1.9 → 4.6.5                                                             | 高（コンポ名・API変更）  | 同上                       |
| [#134](https://github.com/otomatty/zedi/pull/134) | react                    | 18.3.1 → 19.2.4                                                           | 高（エコシステム連鎖）   | 同上                       |
| [#135](https://github.com/otomatty/zedi/pull/135) | sonner                   | 1.7.4 → 2.0.7                                                             | 低〜中                   | React 19 後 or 単体で検証  |
| [#136](https://github.com/otomatty/zedi/pull/136) | @hookform/resolvers      | 3.10.0 → 5.2.2                                                            | **zod v4 必須**          | zod 更新とセット           |
| [#137](https://github.com/otomatty/zedi/pull/137) | vaul                     | 0.9.9 → 1.1.2                                                             | 低（React 19 peer 対応） | React 19 後 or 単体で検証  |
| [#138](https://github.com/otomatty/zedi/pull/138) | @types/react             | 18.3.28 → 19.2.14                                                         | React に連動             | #134 と同時                |
| [#139](https://github.com/otomatty/zedi/pull/139) | @types/uuid              | 10.0.0 → 11.0.0                                                           | 低（型のみ）             | **単体でマージ可**         |
| [#140](https://github.com/otomatty/zedi/pull/140) | date-fns                 | 3.6.0 → 4.1.0                                                             | 中（TZ・API）            | 単体ブランチで検証         |

---

## 2. 推奨対応フロー

### Phase 0: すぐ対応してよいもの

1. **PR #131（minor-and-patch）**
   - マージして問題なし。CI 通過を確認してマージ推奨。

2. **PR #139（@types/uuid）**
   - 型定義のみ。`uuid` の使用箇所で型エラーが出ないか確認し、問題なければマージ可。

### Phase 1: メジャーアップデートの依存関係整理

次の依存関係を考慮する必要があります。

- **React 18 → 19**
  - `@types/react` / `@types/react-dom`、`vaul`、`sonner` などが React 19 をサポート。
- **Zod 3 → 4**
  - `@hookform/resolvers` v5 は Zod v4 を前提（PR 説明に「Zod 4 resolver」の修正あり）。
- **react-resizable-panels 2 → 4**
  - コンポーネント名・API が変更（`PanelGroup`→`Group`、`PanelResizeHandle`→`Separator`、`direction`→`orientation`）。
  - 使用箇所: `src/components/ui/resizable.tsx` のみでラップしているため、**1ファイルの修正で済む**。

### Phase 2: 実施パターン（2案）

#### 案A: 段階的マージ（推奨）

1. **今すぐ**
   - #131 をマージ。
   - #139 をマージ（型のみ・影響小）。

2. **date-fns のみ先行（オプション）**
   - #140 用に専用ブランチを切り、`dateUtils.ts` 等の `date-fns` 使用箇所を v4 の破壊的変更に合わせて修正。
   - 問題なければ #140 をマージ。v4 は TZ 対応や `constructFrom` など API 変更あり要確認。

3. **「React 19 + 型」をまとめて対応**
   - #134（react）、#138（@types/react）を同一ブランチで取り込む。
   - `@types/react-dom` も 19 系に更新。
   - ビルド・テスト・手動確認後マージ。

4. **Zod v4 + resolvers v5**
   - #132（zod）、#136（@hookform/resolvers）を同一ブランチで取り込む。
   - コードベースでは `zod` の直接 import が少ないが、`@hookform/resolvers` 経由で zod を使っている可能性があるため、フォーム周りの動作確認を実施。
   - Zod v4 は `ZodError.errors`→`issues`、`message`→`error` など API 変更あり。必要なら [zod-v3-to-v4 codemod](https://github.com/nicoespeon/zod-v3-to-v4) を検討。

5. **react-resizable-panels v4**
   - #133 をマージするブランチで、`resizable.tsx` を v4 API に合わせて修正（`Group` / `Separator` / `orientation`）。
   - 当該 UI を使っている画面のレイアウト確認。

6. **sonner / vaul**
   - #135（sonner）、#137（vaul）は React 19 対応済みのため、Phase 2 の 3 の後にマージするか、単体でテストしてからマージ。

#### 案B: 1本の「メジャーアップデート」ブランチでまとめて対応

- 上記 Phase 2 の 3〜6 をすべて 1 ブランチに取り込み、一括でテスト・修正する。
- 作業量は増えるが、依存関係の不整合を一気に解消できる。
- 開発中のアプリで、まとめてリグレッションを確認する時間が取れる場合向け。

---

## 3. パッケージ別メモ

### zod (PR #132)

- v4 では `ZodError.errors` 廃止 → `ZodError.issues` を使用。
- エラー API が `message` → `error` に変更。
- コード内で `zod` を直接 import している箇所が少ないため、影響は主に `@hookform/resolvers` 経由。
- resolvers は #136 で v5 に上げれば Zod v4 対応になる。

### react-resizable-panels (PR #133)

- 使用箇所は `src/components/ui/resizable.tsx` のみ。
- v4 では `PanelGroup`→`Group`、`PanelResizeHandle`→`Separator`、`direction`→`orientation`。
- ラッパーを v4 用に書き換えれば、呼び出し側は `ResizablePanelGroup` 等の名前を維持できる。

### React 19 (PR #134, #138)

- React 19 は Server Components や Actions 周りの変更あり。
- 現状は Vite + クライアント React なので、影響は比較的限定的と想定。
- `@types/react` / `@types/react-dom` は #134 と同時に 19 系に統一する。

### date-fns (PR #140) — マージ済み

- 使用箇所: `src/lib/dateUtils.ts`、`src/components/layout/Header/MonthNavigation.tsx`。
- v4 はタイムゾーン第一級サポート、`TZDate` の推奨あり。既存の `format` / `parseISO` / `locale: ja` 等の使い方は **v4 でもそのまま動作**。ソース修正は不要だった。
- **PR #140 マージ後のローカル対応**: リモートが React 19 + react-dom 18 のままの場合、`react-dom` を `^19.2.4`、`@types/react-dom` を `^19.2.3` に揃え、`npm install --legacy-peer-deps` を実行。テスト実行時に `@testing-library/dom` が無いとエラーになる場合は `npm install --save-dev @testing-library/dom` を追加。

### sonner (PR #135) / vaul (PR #137)

- いずれも React 19 を peer でサポート。
- 変更内容は機能追加・バグ修正が中心で、破壊的変更は少なめ。
- React 19 マージ後に取り込むか、先に単体でマージしてから React 19 を取るかのどちらでも可。

---

## 4. 推奨アクション（要約）

| 順番 | アクション                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| 1    | **#131 をマージ**（minor-and-patch）。                                                                           |
| 2    | **#139 をマージ**（@types/uuid）。型エラーがないか確認。                                                         |
| 3    | **#140（date-fns）** を別ブランチで取り込み、`dateUtils` と MonthNavigation を v4 対応してからマージするか検討。 |
| 4    | **#134 + #138**（React 19 + @types/react）を 1 ブランチで取り込み、ビルド・テスト・手動確認後にマージ。          |
| 5    | **#132 + #136**（zod v4 + @hookform/resolvers v5）を 1 ブランチで取り込み、フォーム動作確認後にマージ。          |
| 6    | **#133**（react-resizable-panels）をマージし、`resizable.tsx` を v4 API に合わせて修正。                         |
| 7    | **#135（sonner）・#137（vaul）** をマージ（React 19 後 or 単体で検証）。                                         |

Dependabot の「rebase」は必要に応じて `@dependabot rebase` で実行。  
メジャー更新を一時的に止めたい場合は、該当 PR に `@dependabot ignore this major version` でクローズし、後から手動で対応する運用も可能。

---

## 5. 参照

- [Zod v4 Changelog / Migration](https://zod.dev/v4/changelog)
- [react-resizable-panels v4 (Group / Separator / orientation)](https://github.com/bvaughn/react-resizable-panels)
- [date-fns v4 Release notes](https://github.com/date-fns/date-fns/releases)
- リポジトリ: `.github/dependabot.yml`（minor-and-patch グループ設定）
