# Product Requirements Document (PRD): Zedi v1.1

| 項目 | 内容 |
| :--- | :--- |
| **Product Name** | **Zedi** |
| **Version** | **1.1 (Refined Master)** |
| **Platform** | Desktop (Windows, macOS, Linux), Mobile (iOS, Android) |
| **Core Concept** | **"Atomic Thoughts at Light Speed"**<br>思考を「カード」として瞬時に捕捉し、リンクとAIによって無限に拡張する。<br>モバイル時代のZettelkasten（知識の箱）× 高速メモ。 |
| **Target User** | 思考の断片を高速に記録し、それらを編み上げて体系的な知識体系を構築したいナレッジワーカー、エンジニア、研究者。 |

---

## 1. 製品ビジョンと体験 (UX)

### 1.1 デザイン原則
1.  **Speed & Flow (思考の速度):** 起動は0秒。思考を妨げる「保存」「同期待ち」「整理」の手間を排除する。
2.  **Atomic & Constraint (原子性と制約):** 1つのメモは1つのアイデア（カード）に限定する。長文を書くのではなく、小さなカードをリンクで繋ぐことを強制・推奨するUI。
3.  **Time & Context (時間と文脈):** フォルダ階層を廃止。情報は「時間軸（Time Axis）」と「リンク（文脈）」によってのみ整理される。
4.  **Local-First & Conflict-Free (完全な所有):** 常にローカルで動作し、CRDT技術によりオフライン・複数デバイス間でも数学的に矛盾なく同期される。

### 1.2 主要なユーザーフロー (The Expansion Loop)
1.  **Capture (捕捉):**
    *   **Desktop:** ホットキー一発で即座にカードエディタを開く。
    *   **Mobile:** アプリ起動時の「Time Axis」で即座に入力、または**OS標準の共有機能（Share Sheet）**からブラウザ等の情報を直接カードとして放り込む。
2.  **Refine (原子化):** 推奨文字数（約500-1000字）を超えると、UIが「分割」を提案。テキストを選択して「カードとして切り出し（Extract）」を行い、自動リンクを残す。
3.  **Link & Generate (結合と生成):** テキスト中のキーワードを選択し、既存カードへリンク、またはAIによる「Wiki生成」を実行。AIは「短いカード」として解説を即座に生成し、知識を接続する。
4.  **Flow (回遊 & 発見):**
    *   **Desktop:** リンクをクリックすると、画面遷移せず右側に新しいカードがスライドインする（Sliding Panes）。文脈を維持したまま思考を横断する。
    *   **Mobile:** タイムライン上にカードがSNSのように並び、タップで編集・閲覧。
    *   **Search:** 過去の思考は強力な検索機能（リスト表示）により即座に呼び出す。

---

## 2. 機能要件 (Functional Requirements)

### 2.1 ナビゲーションと構造
*   **Time Axis (Default View):**
    *   アプリ起動時のホーム画面。SNSのフィードのように、作成・更新された「カード」が時系列（降順）で並ぶ。
    *   「今日考えたこと」「昨日書いたこと」が自然と目に入るフロー型UI。
    *   Share Sheet経由で追加されたカードもここに流れてくる。
*   **Workspace/Filter:**
    *   物理フォルダは存在しないが、「仕事」「個人」などのタグ/属性によるフィルタリングビューを提供。
*   **Network Graph:**
    *   カード間のリンク関係を可視化し、知識のハブを発見する補助機能。

### 2.2 エディタ機能 (Atomic Card Editor)
*   **Card UI Metaphor:**
    *   「白いA4用紙」ではなく「角丸のカード」としてデザイン。
    *   **Soft Limit:** 1画面に収まる分量（スクロール不要な範囲）を推奨。長くなるとリングインジケーターの色が変化し、心理的に要約や分割を促す（入力ブロックはしない）。
*   **Solid-Tiptap Core:**
    *   Solid.js + Tiptap (Prosemirror) を採用し、Markdown互換かつリッチな編集体験を提供。
    *   ブロック要素: H1-H3, Quote, List, Code Block, Image。
*   **Splitting (Refactoring):**
    *   選択範囲を「新規カードとして抽出」する機能。元の場所には自動的に `[[New Card Title]]` のリンクが残る。

### 2.3 AI機能 (Contextual Assistant)
*   **Wiki Generator (Atomic Definition):**
    *   コマンド（`/wiki`）や選択範囲から発動。
    *   **制約:** AIは長文記事ではなく、「1枚のカード（要約）」を生成して保存する。ユーザーはそれを読み、さらに知りたい単語をリンク化して深掘りする。
*   **Link Suggestions (Rust Backend):**
    *   **Logic:** Aho-Corasick法により、入力中のテキストにある「既存のカードタイトル」をリアルタイム検知（100ms以内）。
    *   **UI:** 該当箇所を点線アンダーラインでハイライト。クリックでリンク確定。勝手にリンク化はしない。

### 2.4 検索と呼び出し (Search & Retrieval)
*   **Global Search (Omni-bar):**
    *   **Trigger:** Desktopは `Cmd+K` / `Ctrl+P`、Mobileはフロー画面上部の検索アイコンから起動。
    *   **Logic:** タイトルおよび本文（Content）の全文検索。Rustバックエンドによるインメモリ/高速検索。
    *   **UI:** 結果は**リスト形式**で表示。
        *   ヒットしたキーワード周辺のテキスト（KWIC: Key Word In Context）をスニペットとして表示し、ハイライトする。
        *   リストを選択すると、DesktopではPaneとして開き、Mobileではカード詳細へ遷移する。

### 2.5 モバイル統合 (Mobile Integration)
*   **Share Sheet Extension:**
    *   iOS/AndroidのOS標準共有メニューに「Zedi」を表示。
    *   Webページや他アプリのテキストを共有した際、Zediアプリを開かずにバックグラウンドで新規カードを作成し保存する。
    *   保存されたカードは自動的に `Inbox` タグが付与され、Time Axisの最上部に現れる。

### 2.6 オンボーディング (Seed Content)
*   **Tutorial as Cards:**
    *   インストール直後の「空っぽ（Cold Start）」状態を防ぐため、チュートリアル自体を実際の「カードデータ」としてプリセットする。
    *   **内容例:**
        *   「👋 Zediへようこそ」（操作説明）
        *   「🔗 リンクの繋ぎ方」（別カードへのリンク実例）
        *   「🤖 AIの使い方」（AI機能のデモ用カード）
    *   ユーザーはこれらのカードを読み、編集し、リンクを辿ることで自然に操作を学習できる。

### 2.7 同期とデータ管理 (CRDT)
*   **Sync Strategy:**
    *   **Algorithm:** CRDT (Conflict-free Replicated Data Types) を採用。
    *   **Behavior:** 「競合」が発生しない。オフライン中にPCとスマホで同じカードを編集しても、文字単位・ブロック単位で自動的にマージされる。
*   **Local-First:** 全データはローカルSQLiteにあり、同期はバックグラウンドで行われる。

---

## 3. 技術スタックとアーキテクチャ

### 3.1 Tech Stack
| 領域 | 技術選定 | 理由 |
| :--- | :--- | :--- |
| **Frontend** | **Solid.js** | 仮想DOMレスによる世界最速クラスの描画パフォーマンス。 |
| **Editor Core** | **solid-tiptap** | Prosemirrorベースの拡張性とSolid.jsのReactivityの融合。 |
| **App Framework** | **Tauri 2.0** | Rustバックエンドによる堅牢性、セキュリティ、Mobile対応。 |
| **Local DB** | **SQLite + CR-SQLite** | CRDT拡張を組み込み、分散データベースとして機能させる。 |
| **Remote DB** | **Supabase** | Auth、およびCRDTメッセージの仲介（Signaling）と永続化ストレージ。 |
| **Search/Logic** | **Rust (Tantivy etc.)** | 全文検索、Aho-Corasickリンク検知の高速実行。 |

### 3.2 データモデル (CRDT Schema Concept)
変更履歴（Operations）を保持し、マージ可能な構造とする。

```sql
-- CRR (Conflict-free Replicated Relations) 対応テーブル
-- 実際はCR-SQLite等のライブラリ経由で管理される

CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    content TEXT,    -- Tiptap JSON (CRDT管理対象)
    created_at INTEGER, -- Time Axisソート用
    updated_at INTEGER,
    workspace_id TEXT
);
SELECT crsql_as_crr('cards');

CREATE TABLE links (
    source_id TEXT,
    target_id TEXT,
    created_at INTEGER,
    PRIMARY KEY (source_id, target_id)
);
SELECT crsql_as_crr('links');
```

---

## 4. 非機能要件 (Non-Functional Requirements)

*   **Performance:**
    *   起動時間：Desktop 0.5秒以内、Mobile 1.0秒以内（コールドスタート）。
    *   入力遅延：数万枚のカードが存在しても入力にラグが発生しないこと。
    *   検索速度：全カード対象の全文検索が100ms以内に結果を返すこと。
*   **Data Integrity:**
    *   CRDTにより、ネットワーク分断後の同期でもデータの消失（Lost Update）を数学的に防ぐ。
*   **UI/UX Quality (Desktop):**
    *   **Sliding Panes (Andy Mode):** 複数のカードを開いた際、横スクロールで快適に閲覧できること。ウィンドウ幅に応じてスタック表示を適切に制御する。

---

## 5. 開発ロードマップ (Milestones)

### Phase 1: The Core & Atomic Editor (Foundation)
*   **目標:** ローカル単体で「最高のカード型メモ」として機能し、検索もできる。
*   **実装:**
    *   Tauri + Solid.js + solid-tiptap 環境構築。
    *   「カード」UIと推奨文字数インジケーターの実装。
    *   **Rustによる全文検索エンジン (Title/Body) とリスト表示UIの実装。**
    *   **初期データ（チュートリアルカード）の投入ロジック実装。**
    *   SQLite (CR-SQLite準備) への保存処理。

### Phase 2: The Sync, Time & Flow (Structure)
*   **目標:** データがデバイス間で矛盾なく同期し、モバイルからも瞬時に情報を放り込める。
*   **実装:**
    *   CRDT同期ロジック (CR-SQLite + Supabase) の実装。
    *   **Time Axis (Mobile Feed)** の実装。
    *   **Mobile Share Sheet (iOS/Android Share Extension) の実装。**
    *   Sliding Panes (Desktop UI) の実装。
    *   カード分割 (Extract) 機能の実装。

### Phase 3: The Intelligence (Expansion)
*   **目標:** AIが思考の接続と拡張を加速させる。
*   **実装:**
    *   Wiki Generator (OpenAI/Anthropic API連携)。
    *   RAG (Embedding) によるチャット検索（過去のカードとの対話）。
    *   Supabase Auth連携と課金/APIキー管理UI。