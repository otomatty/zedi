## 概要

設定画面（`/settings`）の UI/UX を一から見直し、情報重複の解消・入力体験の改善・責務整理により、より使いやすい設定画面を実現する。

## 動機

現在の設定ハブはモバイルネイティブなカード型 UI でセクションをまとめて見られる良さがある一方、以下の問題がある。

1. **情報の重複表示**: Overview カードと SettingsSection で同じ要約（title + description + summary）が二重に表示され、冗長で洗練されていない印象
2. **通知過多**: 自動保存のたびに Toast が表示され、編集中の通知が多くなりがち
3. **責務の重複**: オンボーディング（`/onboarding`）のプロフィール・言語設定が GeneralSettingsForm と重複し、文言・バリデーション・保存導線が二重に実装されている
4. **保守性の低下**: `GeneralSettingsForm.tsx` が 474 行と肥大化し、UX 再設計時の変更コストが高い

## 詳細な説明

### 現状の実装と根拠

| 課題           | 該当箇所                                                                                          | 根拠                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 情報重複       | `SettingsOverview` (L49–58) と `SettingsSection` (L26–33)                                         | どちらも `title` / `description` / `summary` を表示。Overview カードクリックで該当セクションへスクロールする構成で、同じ要約が上部カードとセクション見出し両方に出る                               |
| 通知過多       | `useAISettingsForm` (L73–86), `useStorageSettingsForm` (L27–40), `GeneralSettingsForm` (L372–377) | 800ms デバウンスで自動保存後、毎回 `toast.success` を実行。複数セクションを短時間に編集すると Toast が連発する                                                                                     |
| 責務重複       | `Onboarding.tsx` (L110–220) と `GeneralSettingsForm.tsx`                                          | プロフィール（displayName, avatar）・言語選択の UI とロジックが独立実装。`generalSettings.profile.*` / `generalSettings.language.*` の翻訳を共有しているが、コンポーネント・バリデーションは未共有 |
| ファイル肥大化 | `GeneralSettingsForm.tsx` (474 行)                                                                | Profile / Display / Tour / Language / DataManagement / About の 6 つのカードが 1 ファイルに集約。250 行超の Warning 基準を大きく超える                                                             |

### 改善方針（実装タスク）

**フェーズ 1: 情報設計の整理**

- Overview カードを「ナビゲーション」専用にし、要約はセクション側のみに表示する（または逆に、Overview に要約を集約してセクション見出しからは description のみにする）
- いずれかに一本化し、二重表示を解消する

**フェーズ 2: フィードバック設計の統一**

- 自動保存時は毎回 Toast を出さず、セクション単位の静かな「保存済み」インジケータ（例: チェックマーク + 文言）に統一
- エラー時のみ Toast など強い通知を使用
- AI/Storage/General の保存フィードバックを同一パターンに揃える

**フェーズ 3: 画面責務の共通化**

- Onboarding と General の共通入力（プロフィール・言語）を共有コンポーネント化
- 文言・バリデーション・保存導線を一本化し、二重実装を解消

**フェーズ 4: 保守性の向上**

- `GeneralSettingsForm.tsx` を責務ごとに分割する
  - 例: `ProfileSettingsCard`, `DisplaySettingsCard`, `LanguageSettingsCard`, `DataManagementCard`, `AboutCard` など
- 各カードを独立ファイルまたはサブディレクトリに切り出し、CLAUDE.md の「250 行超 Warning」に沿って整理する

### 影響ファイル一覧

- `src/pages/Settings.tsx`
- `src/components/settings/SettingsOverview.tsx`
- `src/components/settings/SettingsSection.tsx`
- `src/components/settings/GeneralSettingsForm.tsx`（分割候補含む）
- `src/components/settings/useAISettingsForm.ts`
- `src/components/settings/useStorageSettingsForm.ts`
- `src/pages/Onboarding.tsx`

### 受け入れ条件

- [ ] 同一の要約（title / description / summary）が 2 箇所以上に重複表示されていない
- [ ] 正常な自動保存時に Toast が連発しない（セクション単位の静かなフィードバックに統一されている）
- [ ] モバイル表示（sm ブレークポイント）で可読性・操作性が維持されている
- [ ] オンボーディングと General のプロフィール・言語設定が共通コンポーネントを介して一貫している
- [ ] `GeneralSettingsForm` 関連ファイルが 250 行以下に分割されている
- [ ] `bun run lint` および `bun run format:check` が通る
- [ ] 既存の `Settings.test.tsx` / `SettingsOverview.test.tsx` が通る（必要に応じて更新）

## 代替案

- **情報設計**: Overview に要約を残し、セクション見出しは title + description のみにする案（現状の逆）。ユーザーテストでどちらがわかりやすいか検証するとよい
- **保存フィードバック**: インジケータではなく、保存ボタンを明示する「手動保存」方式もあるが、現在の自動保存が期待動作として浸透しているため、フィードバック方式の改善を優先

## 追加情報

- 調査・根拠の詳細: [docs/investigations/settings-ux-redesign.md](docs/investigations/settings-ux-redesign.md)
- 関連レビュー: `docs/reviews/review-develop-20250310-2.md`（Settings Hub 統合時の分割推奨履歴）
