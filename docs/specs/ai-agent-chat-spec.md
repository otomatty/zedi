# AI エージェントチャット機能 仕様書

> **ドキュメントバージョン:** 0.2  
> **作成日:** 2026-02-22  
> **ステータス:** レビュー待ち

---

## 1. 概要

### 1.1 目的

Zedi のヘッダーに AI エージェントチャットを起動するボタンを追加し、**会話を通じて思考を言語化し、そこからページ（知識）を結晶化する**体験を提供する。

従来の Wiki Generator が「タイトルが決まっている → 一発生成」の直線的フローだったのに対し、AIチャットは**まだ言語化できていない曖昧なアイデアを対話で具体化**し、自然にページとして定着させるプロセスを実現する。

### 1.2 背景

#### 既存 AI 機能

| 機能 | フロー | 特徴 |
|------|--------|------|
| Wiki Generator | タイトル → 一発生成 → エディタに反映 | トピックが明確な時に強力 |
| Mermaid Generator | テキスト → ダイアグラム生成 | 構造化された出力 |
| サムネイル AI 生成 | タイトル → Gemini 画像生成 | ビジュアル補助 |
| AI 設定 | Server Mode / User API Key | マルチプロバイダー対応 |
| Backend AI 基盤 | WebSocket + HTTP SSE | ストリーミング・使用量管理 |

#### 構造的ギャップ

現在のページ作成パスはすべて **「何を書くか既に決まっている」** ことが前提:

```
空白ページ → タイトル入力 → Wiki Generator （トピック決定済み）
URLから作成 → 自動抽出                     （情報源あり）
画像から作成 → OCR/解析                    （素材あり）
```

しかし実際のナレッジワークでは、**曖昧なアイデアから始まる**ことが大半。ここにAIチャットが入る：

```
曖昧な思考 → [AIチャットで対話] → [アイデアが具体化] → ページとして結晶化
              ↑ 壁のない入口
```

### 1.3 コンセプト: 「会話から知識が結晶化する」

Zedi の「Dormant Seeds（発芽待ちの種）」原則を拡張し、AIチャットを**種を蒔く土壌**として位置づける。

| Zedi 原則 | AIチャットでの実現 |
|-----------|------------------|
| **Speed & Flow** | チャットからワンクリックでページ化。整理の手間なし |
| **Context over Folder** | 会話内容から WikiLink を自動提案。知識グラフを自然に拡張 |
| **Atomic & Constraint** | 1つの長い会話から複数の原子的ページを切り出すことをAIが提案 |
| **Scaffolding by AI** | Wiki Generator の「一発生成」を「対話的足場かけ」に進化 |
| **Dormant Seeds** | 会話自体が発芽前の種。いつでもページになりうる |

### 1.4 設計原則

| 原則 | 説明 |
|------|------|
| **会話ファースト** | ページ作成の新しい入口。「何を書くか」ではなく「何を考えているか」から始める |
| **プロアクティブ AI** | AIが適切なタイミングでページ化・WikiLink を提案。ユーザーが能動的に整理する必要がない |
| **Zedi 速度哲学** | パネル表示/非表示は瞬時。対話フローを阻害しない |
| **コンテキスト連続性** | 会話はサーバーに保存。デバイスを変えても思考の続きから再開できる |
| **既存基盤の再利用** | `callAIService()` / WebSocket / SSE / 使用量管理をそのまま活用 |

---

## 2. ユーザー体験設計

### 2.1 コアとなるユーザーストーリー

#### ストーリー1: 「曖昧なアイデアからページを生む」

```
👤 「分散システムについて整理したいんだけど、何から始めればいい？」
🤖 「分散システムにはいくつかの重要な概念がありますね。
    例えば CAP定理、結果整合性、パーティション耐性など。
    特に興味のある領域はありますか？」
👤 「CAPの定理が面白いと思った。最近読んだ本で...」
🤖 「CAPの定理について整理すると...
    [詳しい説明]

    💡 この内容をページにまとめませんか？
    ┌─────────────────────────────────────┐
    │  📄 「CAP定理」として新しいページを作成  │
    │                                     │
    │  プレビュー:                          │
    │  CAP定理は分散システムにおいて...       │
    │  [[分散システム]] [[結果整合性]]        │
    │                                     │
    │         [作成する]  [編集してから作成]   │
    └─────────────────────────────────────┘
    」
```

#### ストーリー2: 「既存ページを深掘りして新しいページを派生」

```
[ユーザーが「Kubernetes概要」ページを開いている]
[📎 ページ内容を参照中]

👤 「このページの Pod について、もっと詳しく知りたい」
🤖 「Podについて補足しますね...
    [詳しい説明]

    💡 提案:
    ┌──────────────────────────────────────┐
    │  📄 「Kubernetes Pod」として独立ページ化  │
    │  🔗 元ページに [[Kubernetes Pod]]       │
    │     リンクを追加                        │
    │                                      │
    │     [ページを作成]  [元ページに追記]      │
    └──────────────────────────────────────┘
    」
```

#### ストーリー3: 「会話を続けて複数ページを生成」

```
[長い対話の中で複数のトピックに触れた後]

🤖 「この会話から、いくつかのページが作れそうです：

    ┌──────────────────────────────────────┐
    │  📄 生成候補:                          │
    │                                      │
    │  ☑ CAP定理         ← 新規作成         │
    │  ☑ 結果整合性       ← 新規作成         │
    │  ☐ 分散システム概要  ← 既存ページあり   │
    │                                      │
    │  リンク構造:                           │
    │  CAP定理 ←→ 結果整合性                 │
    │  CAP定理 → [[分散システム概要]]          │
    │                                      │
    │     [まとめて作成]  [個別に選択]         │
    └──────────────────────────────────────┘
    」
```

### 2.2 起動方法

| 要素 | 仕様 |
|------|------|
| **配置** | アプリヘッダー右側、`UnifiedMenu`（アバター）の左隣 |
| **アイコン** | `Sparkles`（lucide-react）— 既存 AI 機能と統一感 |
| **トグル動作** | クリックで開閉。開状態で再クリック→閉じる |
| **キーボードショートカット** | `Cmd/Ctrl + Shift + A` でトグル |
| **応答中インジケータ** | ストリーミング中はアイコンにパルスアニメーション |
| **AI 未設定時** | ボタンクリック → AI 設定ページへ遷移（`/settings/ai?returnTo=現在のパス`） |
| **未ログイン時**（サーバーモード） | ログイン誘導表示 |

### 2.3 レスポンシブ表示

#### デスクトップ（≥ 640px / sm ブレークポイント）

```
┌───────────────────────────────────────────────────────────────┐
│  Zedi ◀ 2月 ▶    [🔍 検索...]            [✨] [👤]           │
├──────────────────────────────────┬───┬────────────────────────┤
│                                  │ ║ │  ✨ AI      [📋][+][×] │
│                                  │ ║ ├────────────────────────┤
│                                  │ ║ │  📎 「K8s概要」を参照中  │
│        メインコンテンツ            │ ║ ├────────────────────────┤
│       （エディタ / Home 等）       │ ║ │                        │
│                                  │ ║ │  [メッセージ一覧]        │
│                                  │ ║ │                        │
│                                  │ ║ │  ┌── AI 提案 ────────┐ │
│                                  │ ║ │  │ 📄 ページを作成？   │ │
│                                  │ ║ │  │   [作成] [編集]     │ │
│                                  │ ║ │  └──────────────────┘ │
│                                  │ ║ ├────────────────────────┤
│                                  │ ║ │ [メッセージを入力...]  [→]│
└──────────────────────────────────┴───┴────────────────────────┘
                                    ↑
                               リサイズハンドル
```

- `ResizablePanelGroup` + `ResizablePanel` + `ResizableHandle` を使用
- チャットパネルのデフォルト幅: **30%**（最小 20%、最大 45%）
- リサイズハンドル付き（ドラッグで幅変更可能）
- パネルを閉じても会話履歴は維持される

#### モバイル（< 640px）

```
┌──────────────────────┐
│  [🔍]       [✨][👤]  │  ← Header
├━━━━━━━━━━━━━━━━━━━━━━┤
│      ──────          │  ← ドラッグハンドル
│  ✨ AI   [📋][+][×]  │
├──────────────────────┤
│  📎 「K8s概要」を参照中│
├──────────────────────┤
│                      │
│  [メッセージ一覧]     │
│                      │
│  ┌── AI 提案 ──────┐ │
│  │ 📄 ページを作成？ │ │
│  │  [作成] [編集]   │ │
│  └────────────────┘ │
├──────────────────────┤
│ [メッセージ入力...]  [→]│
└──────────────────────┘
```

- **Drawer（vaul）** を使用（下からスライドアップ）
- 高さ: 画面の **85%**
- ドラッグハンドル付き（下にスワイプで閉じる）

---

## 3. 機能要件

### 3.1 チャット UI

#### メッセージエリア

| 要素 | 仕様 |
|------|------|
| **ユーザーメッセージ** | 右寄せ、primary色背景 |
| **AI メッセージ** | 左寄せ、muted背景、Sparkles アバター |
| **Markdown レンダリング** | 見出し、リスト、コードブロック、太字、リンク対応 |
| **コードブロック** | シンタックスハイライト + コピーボタン |
| **ストリーミング表示** | チャンクごとにリアルタイム表示 + タイピングカーソル |
| **自動スクロール** | 新メッセージ到着時に最下部へ自動スクロール |
| **エラー表示** | 赤系バッジ + リトライボタン |
| **空状態** | ウェルカムメッセージ + コンテキスト連動の提案プロンプト |

#### 入力エリア

| 要素 | 仕様 |
|------|------|
| **テキスト入力** | `textarea`（複数行、自動リサイズ、最大5行まで拡張） |
| **送信** | `Send` アイコン / Enter（Shift+Enter で改行） |
| **停止** | ストリーミング中は送信→停止ボタンに変化 |
| **文字数制限** | 最大 4,000 文字 |

#### パネルヘッダー

| 要素 | 仕様 |
|------|------|
| **タイトル** | 「✨ AI」 |
| **会話一覧ボタン** | `ClipboardList` — 過去の会話を一覧表示・切り替え |
| **新規会話ボタン** | `Plus` — 新しい会話を開始 |
| **閉じるボタン** | `X` — パネルを閉じる |

#### コンテキストバー（メッセージ一覧の上）

| 要素 | 仕様 |
|------|------|
| **表示** | 「📎 {ページタイトル}を参照中」 |
| **ON/OFFトグル** | デフォルトON。クリックでコンテキスト参照を無効化 |
| **表示条件** | PageEditor にいる時のみ表示 |

### 3.2 AI によるプロアクティブ提案

AIは会話の流れの中で、適切なタイミングで以下のアクションを提案する。これはAIの応答に埋め込まれた**構造化ブロック（アクションカード）**として表示される。

#### アクションカードの種類

| カード | トリガー | UI |
|--------|----------|-----|
| **ページ作成提案** | 会話で十分な情報が蓄積された時 | タイトル + プレビュー + WikiLink候補 + [作成][編集してから作成] |
| **複数ページ一括提案** | 会話が複数トピックに広がった時 | チェックボックス付きリスト + リンク構造図 + [まとめて作成] |
| **既存ページへの追記提案** | コンテキスト中のページに関連する補足情報が出た時 | 追記内容のプレビュー + [追記する] |
| **WikiLink 提案** | 会話内で既存ページに関連するキーワードが出た時 | リンク候補リスト + [リンクを追加] |

#### アクションカードの実装方針

AIの応答テキスト中に特定のマーカー（structured output）を検出し、フロントエンドで専用UIに変換する:

```
通常のテキスト応答...

<!-- zedi-action:create-page -->
{
  "type": "create-page",
  "title": "CAP定理",
  "content": "CAP定理は分散システムにおいて...",
  "suggestedLinks": ["分散システム", "結果整合性"],
  "reason": "CAPの定理について十分な情報が整理されましたので、ページとしてまとめることをお勧めします。"
}
<!-- /zedi-action -->
```

### 3.3 コンテキスト連携

#### 自動コンテキスト

| ページ | コンテキスト |
|--------|-------------|
| **PageEditor (`/page/:id`)** | ページタイトル + エディタ内容（プレーンテキスト化） |
| **Home (`/home`)** | 最近のページ一覧（タイトルのみ、最大 10 件） |
| **SearchResults (`/search`)** | 検索クエリ + 結果タイトル一覧 |
| **その他** | コンテキストなし（汎用チャット） |

#### コンテキストの渡し方

- **システムプロンプト** にページ内容を自動付与
- デフォルト ON、ユーザーがコンテキストバーのトグルで OFF にできる
- コンテキスト有効時、入力エリアのプレースホルダーが「このページについて質問...」に変化

### 3.4 会話管理

#### 会話の保存

- **サーバー保存**（Aurora PostgreSQL）— デバイス間同期
- 会話は自動保存（メッセージ送信/受信ごとにサーバーへ同期）
- 最大 **100 メッセージ/会話**
- 最大 **50 会話/ユーザー**（超過時は最も古い会話を自動削除）

#### 会話一覧

- パネルヘッダーの `📋` ボタンで会話一覧をスライド表示
- 各会話に自動タイトル付与（最初のユーザーメッセージから生成、または AI 要約）
- 会話の切り替え・削除が可能
- 新規会話ボタンで空のチャットを開始

#### ローカルフォールバック

- 未ログイン or User API Key モード → `localStorage` に保存
- ログイン時にサーバーと自動マージ（将来対応）

### 3.5 ウェルカム画面（空状態）

コンテキストに応じて提案プロンプトが動的に変化:

#### エディタ内コンテキスト時

```
   ✨

  何でもお手伝いします

  ┌──────────────────────────────┐
  │  📝 このページの内容を要約して │
  │  🔗 関連するキーワードを提案して│
  │  🌐 英語に翻訳して            │
  │  💡 この内容を深掘りしたい      │
  └──────────────────────────────┘
```

#### コンテキストなし時

```
   ✨

  何でも聞いてください。
  会話からページを作成できます。

  ┌────────────────────────────────┐
  │  🧠 最近学んだことを整理したい    │
  │  📖 ○○について教えて            │
  │  🗂️ アイデアをまとめたい         │
  │  ✍️ ブログ記事の下書きを作りたい  │
  └────────────────────────────────┘
```

### 3.6 インタラクション一覧

| 操作 | 動作 |
|------|------|
| ヘッダー ✨ ボタンクリック | チャットパネルをトグル |
| `Cmd/Ctrl + Shift + A` | チャットパネルをトグル |
| Enter | メッセージ送信 |
| Shift+Enter | テキスト内改行 |
| 停止ボタン | ストリーミング中断（AbortController） |
| 新規会話（`+`） | 新しい空の会話を開始 |
| 会話一覧（`📋`） | 過去の会話リストを表示 |
| パネル閉じる（`×`） | パネルを非表示（会話は保持） |
| Escape | パネルを閉じる |
| 提案プロンプトクリック | プロンプトを入力欄に挿入して即送信 |
| アクションカード [作成する] | 会話内容からページを生成し遷移 |
| アクションカード [編集してから作成] | ページ作成後エディタで内容を調整 |
| アクションカード [追記する] | 現在のページに AI 提案内容を追記 |
| メッセージ長押し/右クリック | コピーメニュー |

---

## 4. 技術設計

### 4.1 コンポーネント構成

```
src/
├── components/
│   ├── ai-chat/
│   │   ├── AIChatPanel.tsx              # メインパネル（デスクトップ/モバイル自動切替）
│   │   ├── AIChatMessages.tsx           # メッセージ一覧（ScrollArea）
│   │   ├── AIChatInput.tsx              # 入力エリア（textarea + 送信/停止）
│   │   ├── AIChatHeader.tsx             # パネルヘッダー（タイトル + アクションボタン群）
│   │   ├── AIChatMessage.tsx            # 個別メッセージバブル（Markdown対応）
│   │   ├── AIChatWelcome.tsx            # 空状態・ウェルカム画面
│   │   ├── AIChatSuggestions.tsx        # コンテキスト連動の提案プロンプト
│   │   ├── AIChatContextBar.tsx         # 「📎ページを参照中」バー
│   │   ├── AIChatConversationList.tsx   # 過去の会話一覧
│   │   ├── AIChatActionCard.tsx         # AI提案のアクションカード
│   │   ├── AIChatPagePreview.tsx        # ページ作成プレビュー
│   │   └── ContentWithAIChat.tsx        # レスポンシブレイアウトラッパー
│   ├── layout/
│   │   └── Header/
│   │       └── AIChatButton.tsx         # ヘッダーの起動ボタン
├── hooks/
│   ├── useAIChat.ts                     # チャット送受信・ストリーミングロジック
│   └── useAIChatConversations.ts        # 会話CRUD（React Query）
├── stores/
│   └── aiChatStore.ts                   # Zustand: パネルUI状態
├── contexts/
│   └── AIChatContext.tsx                # ページコンテキスト共有
├── lib/
│   ├── aiChatPrompt.ts                  # システムプロンプト生成
│   └── aiChatActions.ts                 # アクションカードのパース・実行
├── types/
│   └── aiChat.ts                        # 型定義
└── i18n/
    └── locales/
        ├── ja/translation.json          # + aiChat キー追加
        └── en/translation.json          # + aiChat キー追加
```

### 4.2 型定義

```ts
// types/aiChat.ts

/** 会話 */
interface Conversation {
  id: string;                   // UUID
  title: string;                // 自動生成タイトル
  messages: ChatMessage[];
  pageContext?: PageContextSnapshot; // 会話開始時のコンテキストスナップショット
  createdAt: number;
  updatedAt: number;
}

/** メッセージ */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;              // テキスト（Markdown）
  actions?: ChatAction[];       // AI提案のアクションカード
  timestamp: number;
  isStreaming?: boolean;
  error?: string;
}

/** AI がプロアクティブに提案するアクション */
type ChatAction =
  | CreatePageAction
  | AppendToPageAction
  | CreateMultiplePagesAction
  | SuggestWikiLinksAction;

interface CreatePageAction {
  type: "create-page";
  title: string;
  content: string;              // Markdown
  suggestedLinks: string[];     // WikiLink 候補
  reason: string;               // AI がなぜ提案したかの説明
}

interface AppendToPageAction {
  type: "append-to-page";
  pageId: string;
  pageTitle: string;
  content: string;
  reason: string;
}

interface CreateMultiplePagesAction {
  type: "create-multiple-pages";
  pages: Array<{
    title: string;
    content: string;
    suggestedLinks: string[];
  }>;
  linkStructure: Array<{ from: string; to: string }>;
  reason: string;
}

interface SuggestWikiLinksAction {
  type: "suggest-wiki-links";
  links: Array<{
    keyword: string;
    existingPageId?: string;     // 既存ページがある場合のID
    existingPageTitle?: string;
  }>;
  reason: string;
}

/** ページコンテキスト（各ページが提供） */
interface PageContext {
  type: "editor" | "home" | "search" | "other";
  pageId?: string;
  pageTitle?: string;
  pageContent?: string;
  recentPageTitles?: string[];
  searchQuery?: string;
}

/** コンテキストのスナップショット（会話保存用） */
interface PageContextSnapshot {
  type: PageContext["type"];
  pageId?: string;
  pageTitle?: string;
}
```

### 4.3 状態管理

#### `aiChatStore.ts`（Zustand）— UI状態のみ

```ts
interface AIChatUIState {
  isOpen: boolean;
  activeConversationId: string | null;
  isStreaming: boolean;
  contextEnabled: boolean;
  showConversationList: boolean;

  // Actions
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setActiveConversation: (id: string | null) => void;
  setStreaming: (isStreaming: boolean) => void;
  toggleContext: () => void;
  toggleConversationList: () => void;
}
```

- `zustand/persist` で `localStorage` に保存（パネル開閉状態・最後のアクティブ会話IDを記憶）

#### `AIChatContext.tsx`（React Context）— ページコンテキスト

```ts
interface AIChatContextValue {
  pageContext: PageContext | null;
  setPageContext: (ctx: PageContext | null) => void;
}
```

- `App.tsx` レベルで `AIChatProvider` をラップ
- 各ページ（PageEditorView, Home 等）が `useEffect` で `setPageContext` を呼び出す

#### `useAIChatConversations.ts`（React Query）— サーバーデータ

```ts
// 会話一覧
const { data: conversations } = useQuery({
  queryKey: ["ai-conversations"],
  queryFn: () => fetchConversations(),
});

// 個別会話の取得
const { data: conversation } = useQuery({
  queryKey: ["ai-conversation", conversationId],
  queryFn: () => fetchConversation(conversationId),
});

// 会話の作成/更新/削除
const createMutation = useMutation({ mutationFn: createConversation });
const updateMutation = useMutation({ mutationFn: updateConversation });
const deleteMutation = useMutation({ mutationFn: deleteConversation });
```

### 4.4 レイアウト統合

#### `ContentWithAIChat` ラッパーコンポーネント

```tsx
function ContentWithAIChat({ children }: { children: React.ReactNode }) {
  const isSmallScreen = useIsSmallScreen(); // < 640px
  const { isOpen } = useAIChatStore();

  if (isSmallScreen) {
    return (
      <>
        {children}
        <Drawer open={isOpen} onOpenChange={togglePanel}>
          <DrawerContent className="h-[85vh]">
            <AIChatPanel />
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  if (!isOpen) return <>{children}</>;

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={70} minSize={40}>
        {children}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
        <AIChatPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
```

#### 各ページへの統合

**App.tsx レベル**（Router の外側）に `AIChatProvider` を配置:

```tsx
// App.tsx
<AIChatProvider>
  <BrowserRouter>
    <GlobalShortcutsProvider>
      <GlobalSearchProvider>
        <Routes>...</Routes>
      </GlobalSearchProvider>
    </GlobalShortcutsProvider>
  </BrowserRouter>
</AIChatProvider>
```

**各ページ**では `ContentWithAIChat` でメインコンテンツをラップ:

```tsx
// PageEditorView.tsx
<div className="min-h-screen bg-background flex flex-col">
  <PageEditorHeader />
  <ContentWithAIChat>
    <main>
      <PageEditorContent />
    </main>
  </ContentWithAIChat>
</div>
```

### 4.5 AI サービス連携

既存の `callAIService()` をそのまま利用:

```ts
// useAIChat.ts
async function sendMessage(userMessage: string) {
  const settings = loadAISettings();
  const systemPrompt = buildSystemPrompt(pageContext, existingPageTitles);

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  await callAIService(
    settings,
    {
      provider: settings.provider,
      model: settings.model,
      messages,
      options: { stream: true, feature: "ai_chat" },
    },
    {
      onChunk: (chunk) => appendToStreamingMessage(chunk),
      onComplete: (response) => {
        finalizeMessage(response);
        parseAndAttachActions(response.content);  // アクションカードを検出
        syncToServer(conversation);               // サーバーに保存
      },
      onError: (error) => handleError(error),
      onUsageUpdate: (usage) => updateUsage(usage),
    },
    abortController.signal
  );
}
```

### 4.6 システムプロンプト設計

```ts
// lib/aiChatPrompt.ts
function buildSystemPrompt(
  context: PageContext | null,
  existingPageTitles: string[]
): string {
  return `
あなたは Zedi のAIアシスタントです。
Zedi はナレッジネットワークツールで、ユーザーの思考を[[WikiLink]]で繋がったページに整理します。

## あなたの役割
- ユーザーとの対話を通じて、思考を明確化する手助けをする
- 適切なタイミングで、会話内容をページとして整理することを提案する
- 既存のページとの関連（WikiLink）を見つけて提案する

## 応答ガイドライン
- ユーザーの言語に合わせて応答する
- Markdown形式で回答する
- 簡潔で実用的な回答を心がける

## ページ作成の提案
会話の中で十分な情報が蓄積されたと判断した場合、以下のフォーマットでページ作成を提案してください:

<!-- zedi-action:create-page -->
{"type":"create-page","title":"ページタイトル","content":"Markdown内容...","suggestedLinks":["関連キーワード"],"reason":"提案理由"}
<!-- /zedi-action -->

提案のタイミング:
- ユーザーが特定のトピックについて詳しく説明した後
- 議論が一区切りついた時
- ユーザーが「まとめて」「記録して」等の意図を示した時
- 複数のトピックが出た場合は create-multiple-pages を使用

## 既存ページとの連携
ユーザーの既存ページタイトル一覧:
${existingPageTitles.map(t => `- ${t}`).join('\n')}

上記のタイトルに関連するキーワードが会話に出た場合、[[WikiLink]]として参照できることを提案してください。

${context ? buildContextSection(context) : ''}
`;
}
```

### 4.7 アクションカードのパースと実行

```ts
// lib/aiChatActions.ts

/** AI応答テキストからアクションカードを抽出 */
function parseActions(content: string): ChatAction[] {
  const regex = /<!-- zedi-action:(\w[\w-]*) -->\n([\s\S]*?)\n<!-- \/zedi-action -->/g;
  const actions: ChatAction[] = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    try {
      const action = JSON.parse(match[2]) as ChatAction;
      actions.push(action);
    } catch (e) {
      console.warn("Failed to parse action:", match[2]);
    }
  }

  return actions;
}

/** アクションカードのコンテンツを除いた表示用テキスト */
function getDisplayContent(content: string): string {
  return content.replace(
    /<!-- zedi-action:[\w-]+ -->[\s\S]*?<!-- \/zedi-action -->/g,
    ""
  ).trim();
}

/** ページ作成アクションの実行 */
async function executeCreatePage(action: CreatePageAction): Promise<string> {
  const tiptapContent = convertMarkdownToTiptapContent(action.content);
  const page = await createPageMutation.mutateAsync({
    title: action.title,
    content: JSON.stringify(tiptapContent),
  });
  // WikiLink の自動設定
  for (const link of action.suggestedLinks) {
    await syncWikiLink(page.id, link);
  }
  return page.id;
}
```

---

## 5. バックエンド設計

### 5.1 新規 API エンドポイント

既存の Pages CRUD パターンに準拠して会話ストレージ API を追加。

| メソッド | パス | 説明 | 認証 |
|----------|------|------|------|
| `GET` | `/api/ai/conversations` | 会話一覧（タイトル・日時のみ） | `authRequired` |
| `GET` | `/api/ai/conversations/:id` | 会話詳細（メッセージ含む） | `authRequired` |
| `POST` | `/api/ai/conversations` | 会話作成 | `authRequired` |
| `PUT` | `/api/ai/conversations/:id` | 会話更新（メッセージ追加等） | `authRequired` |
| `DELETE` | `/api/ai/conversations/:id` | 会話削除（論理削除） | `authRequired` |

### 5.2 DB スキーマ

#### マイグレーション: `db/aurora/008_ai_conversations.sql`

```sql
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL DEFAULT '',
  context_type VARCHAR(20),          -- 'editor' | 'home' | 'search' | 'other'
  context_page_id UUID,              -- 関連ページ（あれば）
  context_page_title VARCHAR(500),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,         -- 'user' | 'assistant'
  content TEXT NOT NULL,
  actions JSONB,                     -- ChatAction[] のJSON
  sort_order INTEGER NOT NULL,       -- メッセージ順序
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conversations_owner ON ai_conversations(owner_id, is_deleted, updated_at DESC);
CREATE INDEX idx_ai_conv_messages_conv ON ai_conversation_messages(conversation_id, sort_order);
```

#### Drizzle スキーマ: `schema/aiConversations.ts`

```ts
import { pgTable, uuid, varchar, boolean, timestamp, text, integer, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users";

export const aiConversations = pgTable("ai_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull().default(""),
  contextType: varchar("context_type", { length: 20 }),
  contextPageId: uuid("context_page_id"),
  contextPageTitle: varchar("context_page_title", { length: 500 }),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiConversationMessages = pgTable("ai_conversation_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(),
  content: text("content").notNull(),
  actions: jsonb("actions"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AIConversation = typeof aiConversations.$inferSelect;
export type NewAIConversation = typeof aiConversations.$inferInsert;
export type AIConversationMessage = typeof aiConversationMessages.$inferSelect;
export type NewAIConversationMessage = typeof aiConversationMessages.$inferInsert;
```

### 5.3 既存 AI チャットエンドポイントとの関係

| エンドポイント | 目的 | 変更 |
|---------------|------|------|
| `POST /api/ai/chat` | AI 推論（ストリーミング） | **変更なし** — そのまま利用 |
| WebSocket API Gateway | AI ストリーミング | **変更なし** — そのまま利用 |
| `GET /api/ai/models` | モデル一覧 | **変更なし** |
| `GET /api/ai/usage` | 使用量 | **変更なし** |
| `POST /api/ai/conversations` | 会話保存 | **新規追加** |

AI 推論自体は既存のインフラで行い、会話の永続化のみ新規 API として追加する設計。

---

## 6. UI/UX 詳細

### 6.1 アニメーション

| 対象 | アニメーション |
|------|--------------|
| パネル開閉（デスクトップ） | `ResizablePanel` のスムーズなリサイズ |
| Drawer 開閉（モバイル） | vaul のスプリングアニメーション |
| メッセージ出現 | `fade-in` + `slide-up`（100ms） |
| ストリーミング | タイピングカーソル点滅 |
| アクションカード | `fade-in` + ボーダーハイライト（200ms） |
| 応答中ボタン | Sparkles アイコンのパルスアニメーション |
| 会話一覧スライド | 左からスライドイン（150ms） |

### 6.2 テーマ対応

- ダーク/ライトテーマ両対応（既存 CSS 変数を使用）
- アクションカード: `border-primary/50` + `bg-primary/5` で視覚的に差別化
- メッセージバブル: ユーザー `bg-primary text-primary-foreground`、AI `bg-muted`

---

## 7. 非機能要件

### 7.1 パフォーマンス

| 項目 | 目標 |
|------|------|
| パネル表示 | 100ms 以内 |
| 初回メッセージ応答開始 | 2秒以内（ストリーミング） |
| メッセージ描画 | 60fps を維持 |
| 会話一覧ロード | 500ms 以内 |
| サーバー保存 | 非同期、UI をブロックしない |

### 7.2 アクセシビリティ

- キーボードナビゲーション対応（Tab, Escape, Enter）
- `aria-label` 適切に設定
- フォーカストラップ（モバイル Drawer 時）
- ライブリージョン（新メッセージ通知）
- アクションカードのボタンにフォーカス可能

### 7.3 エラーハンドリング

| エラー | 対応 |
|--------|------|
| AI 設定未完了 | 設定ページへ誘導（`/settings/ai?returnTo=...`） |
| 未ログイン（サーバーモード） | ログイン誘導 |
| ネットワークエラー | リトライボタン + エラーメッセージ |
| レートリミット（429） | 使用量超過メッセージ + 待機時間 |
| ストリーミング中断 | 部分応答を保持 + 「中断されました」表示 |
| トークン制限超過 | 古いメッセージを自動トリミングして送信 |
| 会話保存失敗 | ローカルにフォールバック保存 + リトライ |
| アクションカードのパース失敗 | テキストとしてそのまま表示（graceful degradation） |

### 7.4 セキュリティ

- AI 応答の HTML はサニタイズ（XSS 対策、react-markdown の標準挙動に依存）
- ユーザー API キーは既存の暗号化機構を利用
- 会話データはユーザー単位で完全に分離（ownerId チェック）
- ページコンテキストのコンテキスト送信はデフォルト ON だがトグルで OFF にできる

---

## 8. 制約・依存

### 8.1 既存基盤からの依存

| 依存 | 詳細 |
|------|------|
| `callAIService()` | AI 推論（WebSocket + HTTP SSE） |
| `AISettings` / `loadAISettings()` | プロバイダー・モデル設定 |
| `convertMarkdownToTiptapContent()` | ページ作成時のコンテンツ変換 |
| `useCreatePage` | ページ作成ミューテーション |
| Cognito `getIdToken()` | サーバー API 認証 |
| 使用量管理 | `feature: "ai_chat"` で記録 |

### 8.2 新規追加が必要なもの

| 項目 | 詳細 |
|------|------|
| **フロントエンド** | チャットUIコンポーネント群 + Zustand + Context + 型定義 |
| **バックエンド** | 会話 CRUD API（`/api/ai/conversations`） |
| **DB** | `ai_conversations` + `ai_conversation_messages`テーブル |
| **i18n** | `aiChat` キーを ja/en 翻訳ファイルに追加 |
| **パッケージ** | `react-markdown` + `remark-gfm`（Markdownレンダリング） |

### 8.3 既存パッケージで対応可能

| 用途 | パッケージ | 状態 |
|------|-----------|------|
| リサイズパネル | `react-resizable-panels` | 導入済み |
| ドロワー | `vaul` | 導入済み |
| アイコン | `lucide-react` | 導入済み |
| スクロールエリア | shadcn/ui `ScrollArea` | 導入済み |
| サーバー状態管理 | `@tanstack/react-query` | 導入済み |
| クライアント状態 | `zustand` | 導入済み |
| Markdown → Tiptap | `convertMarkdownToTiptapContent()` | 実装済み |

---

## 9. 実装計画

### Step 1: 基盤構築

1. 型定義（`types/aiChat.ts`）
2. Zustand ストア（`stores/aiChatStore.ts`）
3. Context プロバイダー（`contexts/AIChatContext.tsx`）
4. システムプロンプト生成（`lib/aiChatPrompt.ts`）
5. アクションカードパーサー（`lib/aiChatActions.ts`）

### Step 2: チャット UI

6. `AIChatPanel.tsx` — メインパネル
7. `AIChatHeader.tsx` — パネルヘッダー
8. `AIChatMessages.tsx` + `AIChatMessage.tsx` — メッセージ表示（Markdown対応）
9. `AIChatInput.tsx` — 入力エリア
10. `AIChatWelcome.tsx` + `AIChatSuggestions.tsx` — ウェルカム画面
11. `AIChatContextBar.tsx` — コンテキスト参照バー

### Step 3: レイアウト統合

12. `ContentWithAIChat.tsx` — レスポンシブラッパー
13. `AIChatButton.tsx` — ヘッダーボタン
14. Header への統合
15. PageEditorView への統合
16. Home / SearchResults への統合
17. App.tsx に AIChatProvider 追加

### Step 4: AI 連携

18. `useAIChat.ts` — 送受信・ストリーミングフック
19. アクションカード UI（`AIChatActionCard.tsx`）
20. ページ作成アクション実行
21. WikiLink 提案・追加
22. 既存ページ追記アクション

### Step 5: 会話永続化

23. DB マイグレーション（`008_ai_conversations.sql`）
24. Drizzle スキーマ（`schema/aiConversations.ts`）
25. API ルート（`routes/ai/conversations.ts`）
26. `useAIChatConversations.ts` — React Query フック
27. `AIChatConversationList.tsx` — 会話一覧 UI

### Step 6: 仕上げ

28. i18n キー追加（ja/en）
29. キーボードショートカット（`Cmd/Ctrl+Shift+A`）
30. アニメーション・トランジション
31. エラーハンドリング
32. テスト

---

## 10. テスト計画

### 10.1 ユニットテスト

- `aiChatStore` の状態遷移
- `buildSystemPrompt()` の出力検証
- `parseActions()` のパース正確性
- `getDisplayContent()` のアクション除去
- メッセージ数制限（100 件）の動作

### 10.2 コンポーネントテスト

- `AIChatPanel` の開閉動作
- レスポンシブ切替（ResizablePanel ↔ Drawer）
- メッセージの表示・自動スクロール
- アクションカードの表示・ボタン動作
- ウェルカム画面のコンテキスト連動
- AI 未設定時の導線
- エラー状態の表示・リトライ

### 10.3 E2E テスト

- ヘッダーボタンからのチャット起動
- メッセージ送受信（ストリーミング）
- ストリーミングの中断
- アクションカードからページ作成 → ページ遷移
- 会話一覧の表示・切り替え
- パネル閉じ→再開時の会話復元
- モバイル/デスクトップの表示切り替え
- 未ログイン時の挙動
