# 初期設定ウィザード UX 提案

## 1. 現在の実装状況の調査結果

### 1.1 初回アクセス時の流れ（現状）

| ステップ | 内容                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| 1        | ユーザーがサインイン（例: Google）                                                                                |
| 2        | `AuthCallback` でトークン取得後、`/home` にリダイレクト                                                           |
| 3        | Home ページ表示。約 500ms 後に **WelcomeModal** を表示                                                            |
| 4        | モーダルで「Zediへようこそ！」＋ 3 つの機能紹介（書く・繋ぐ・発見）＋ クイックヒントを表示                        |
| 5        | ユーザーは「始める」でモーダルを閉じる（**クイックツアーを見る** は Home から渡されておらず、ツアー起動は未実装） |

### 1.2 関連する既存実装

- **オンボーディング状態**（`src/lib/onboardingState.ts`）
  - `localStorage` キー: `zedi-onboarding`
  - 管理項目: `hasCompletedSetupWizard`, `hasCompletedTour`, `completedSteps`, `dismissedHints`
  - `markSetupWizardCompleted()`, `markTourCompleted()` などが定義済み
  - ※ `hasSeenWelcome` は削除済み。初回判定は `hasCompletedSetupWizard` のみ。

- **プロフィール**（`src/hooks/useProfile.ts`）
  - `displayName`, `avatarUrl` を API（`upsertMe`）で取得・保存
  - 未設定時は Cognito の `fullName` / `username` / `imageUrl` をフォールバック

- **一般設定**（`src/hooks/useGeneralSettings.ts`, `src/types/generalSettings.ts`）
  - `locale`: `"ja" | "en"`（日本語 / English）
  - テーマ・エディタフォントサイズも同じ一般設定で管理
  - 設定は既存の localStorage / 設定 API 経由で永続化

- **チュートリアルページのシード**（`src/hooks/useSeedData.ts`）
  - **未サインイン**かつページが 0 件のとき、3 ページ（ようこそ・リンク・思考を捕捉する）を自動作成
  - サインイン済み初回ユーザーにはシードは実行されない（`isSignedIn` で早期 return）

### 1.3 現状のユーザー体験の課題

1. **初回は「ガイド画面」のみ**  
   名前・プロフィール画像・言語は設定画面で後から変更する前提で、初回にまとめて設定する流れがない。

2. **ツアーが未実装**  
   「クイックツアーを見る」は UI 上ほぼ使われておらず、`startTour` も TODO のため、初回ユーザーにツアーを選ばせる体験がない。

3. **文言が日本語固定**  
   WelcomeModal は i18n 未使用のため、言語設定前に表示されると英語ユーザーには不親切。

4. **初回判定が「ウェルカムを見たか」のみ**  
   「初期設定を完了したか」という状態がなく、ウィザード完了とツアー選択を組み込みにくい。

---

## 2. 提案: ユーザーフロー（初期設定ウィザード ＋ ツアー選択）

### 2.1 全体フロー（ユーザー視点）

```
[サインイン完了]
       ↓
[ /home にリダイレクト ]
       ↓
「初期設定がまだ」？
   Yes → [初期設定ウィザード開始]
   No  → [通常の Home 表示]
       ↓
[ウィザード Step 1] プロフィール
  - 表示名（ユーザー名）
  - プロフィール画像（任意）
       ↓
[ウィザード Step 2] 使用言語
  - 日本語 / English
  - 選択後、即時で UI 言語切り替え
       ↓
[ウィザード Step 3] ガイドツアー
  - 「クイックツアーを見る」 / 「スキップして始める」
       ↓
「ツアーを見る」→ [ガイドツアー実行] → [Home に戻る]
「スキップ」    → [ウィザード完了]     → [Home のまま]
       ↓
[通常利用開始]
```

### 2.2 詳細フロー

#### A. 初回判定

- **「初回」の定義:**  
  `hasCompletedSetupWizard` が `onboardingState` にあり、  
  **「サインイン済み & このフラグが false」** のときだけウィザードを表示する。
- `hasSeenWelcome` は削除済み。初回判定は `hasCompletedSetupWizard` のみ。

#### B. ウィザードの表示タイミング・場所（実装済み）

- **いつ:** サインイン済みで `/home` にアクセスしたとき、初回なら `/onboarding` にリダイレクト。
- **どこで:** 専用ページ **`/onboarding`** でウィザードを表示（新規ページとして実装済み）。

#### C. Step 1: プロフィール

- **表示名（ユーザー名）**
  - 既存の `useProfile` の `displayName` を編集。
  - Cognito の名前があれば初期値として表示し、任意で変更可能に。
- **プロフィール画像**
  - 既存の `useProfile` の `avatarUrl`。
  - アップロード or 削除。未設定のまま「次へ」も可。
- **保存:** 各ステップで「次へ」を押した時点で `updateProfile` + `save()` を呼び、API に反映。

#### D. Step 2: 使用言語

- **選択肢:** 既存の `LOCALE_OPTIONS`（`ja` / `en`）をそのまま利用。
- **挙動:** 選択したら `useGeneralSettings` の `updateLocale` を呼び、i18n を切り替え。  
  以降のウィザード文言も選択した言語で表示。

#### E. Step 3: ガイドツアー

- **選択肢のみ**
  - 「クイックツアーを見る」→ ウィザードを閉じたあと、ガイドツアーを開始。
  - 「スキップして始める」→ ウィザードだけ完了し、ツアーは行わない。
- ツアー実装は別タスクとして、ここでは「ツアーを開始する / スキップする」の分岐だけ用意。

#### F. ウィザード完了後

- `markSetupWizardCompleted()` で `hasCompletedSetupWizard: true` を保存。
- ツアーを選んだ場合は、ウィザード完了後にツアーを開始。
- どちらの場合も、次回以降の `/home` アクセスでは `/onboarding` には飛ばさず、通常の Home を表示。

### 2.3 既存機能との対応

| 要件                | 既存実装                                         | 対応方針                                                                   |
| ------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| ユーザー名          | `useProfile().profile.displayName` + API         | ウィザード Step 1 で入力・保存                                             |
| プロフィール画像    | `useProfile().profile.avatarUrl` + API           | ウィザード Step 1 でアップロード/削除                                      |
| 使用言語            | `useGeneralSettings().locale` + `LOCALE_OPTIONS` | ウィザード Step 2 で選択し即時反映                                         |
| ツアー実施/スキップ | `useOnboarding().startTour`（未実装）            | Step 3 で選択。スキップ時は `markTourCompleted` 相当で「ツアー不要」を記録 |
| 初回判定            | （削除: `hasSeenWelcome`）                       | `hasCompletedSetupWizard` でウィザード完了時 true                          |

### 2.4 削除・変更したもの（反映済み）

- **削除:** WelcomeModal コンポーネントおよび `hasSeenWelcome` / `markWelcomeSeen`。
- **変更済み:**
  - `onboardingState`: `hasCompletedSetupWizard` と `markSetupWizardCompleted()` を追加。
  - `useOnboarding`: `needsSetupWizard` と `completeSetupWizard` を公開。初回時はウィザード未完了として扱う。
  - Home: 初回時は `/onboarding` へリダイレクト。WelcomeModal は削除。
  - 新規ページ: `pages/Onboarding.tsx`（`/onboarding`）でウィザードを表示。

---

## 3. まとめ

- **現状:** 初回は WelcomeModal のみで、プロフィール・言語・ツアー選択は別々か未実装。
- **提案:** 初回に **初期設定ウィザード**（プロフィール → 言語 → ツアー実施/スキップ）を挟み、  
  その完了をもって「初回セットアップ済み」とみなすフローにする。
- **実装の土台:** プロフィール・言語は既存の `useProfile` と `useGeneralSettings` をそのまま利用し、  
  ウィザードは「入力 UI ＋ 次へで保存」と「完了フラグの管理」を追加する形で実現可能。

このフローをベースに、ルートを `/onboarding` にするか Home 上オーバーレイにするか、  
およびツアーライブラリ（例: react-joyride）の選定と実装を次のステップとして進められます。
