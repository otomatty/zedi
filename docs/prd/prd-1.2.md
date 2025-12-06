# Product Requirements Document (PRD): Zedi v1.2

| 項目 | 内容 |
| :--- | :--- |
| **Product Name** | **Zedi** |
| **Version** | **1.2 (Refined Master)** |
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
2.  **Refine (原子化):** 推奨文字数（約500-1000字）を超えると、UIが分割を提案。「Magic Split」機能により、直感的な操作でカードを切り出し、AIがタイトルを自動付与する。
3.  **Link & Generate (結合と生成):** テキスト中のキーワードを選択し、既存カードへリンク、またはAIによる「Wiki生成」を実行。
4.  **Flow (回遊 & 発見):**
    *   **Desktop:** リンクをクリックすると、画面遷移せず右側に新しいカードがスライドインする（Sliding Panes）。
    *   **Mobile:** タイムライン上にカードがSNSのように並び、タップで編集・閲覧。
    *   **Search:** 文脈を考慮した「Smart Snippet」付きの検索結果により、過去の思考を即座に再発見する。

---

## 2. 機能要件 (Functional Requirements)

### 2.1 ナビゲーションと構造
*   **Time Axis (Default View):**
    *   アプリ起動時のホーム画面。SNSのフィードのように、作成・更新された「カード」が時系列（降順）で並ぶ。
    *   Share Sheet経由で追加されたカードもここに流れてくる。
*   **Workspace/Filter:**
    *   物理フォルダは存在しないが、「仕事」「個人」などのタグ/属性によるフィルタリングビューを提供。
*   **<del>Network Graph</del>:** (v1.2削除: 検索とエディタ体験にリソースを集中するため除外)

### 2.2 エディタ機能 (Atomic Card Editor)
*   **Card UI Metaphor:**
    *   「白いA4用紙」ではなく「角丸のカード」としてデザイン。
    *   **Soft Limit:** 1画面に収まる分量（スクロール不要な範囲）を推奨。
*   **Solid-Tiptap Core:**
    *   Solid.js + Tiptap (Prosemirror) を採用。Markdown互換。
*   **Smart Splitting (Magic Split):**
    *   **Drag to Extract:** 選択したテキストブロックを、カードの外（余白部分）や別のPane領域へドラッグ＆ドロップすることで、新規カードとして切り出す。
    *   **Auto Link:** 元の場所には自動的に `[[New Card Title]]` のリンクが残る。
    *   **AI Titling:** 切り出されたテキストの内容を解析し、AIが適切な「タイトル案」を即座に生成・入力済み状態にする（ユーザーはEnterで確定、または修正するだけ）。

### 2.3 AI機能 (Contextual Assistant)
*   **Wiki Generator:**
    *   コマンドや選択範囲から、キーワードに対する解説カードをAIが生成する。
*   **Link Suggestions:**
    *   Aho-Corasick法により、入力中のテキストにある「既存のカードタイトル」をリアルタイム検知し、リンク化を提案。

### 2.4 検索と呼び出し (Search & Retrieval)
*   **Global Search (Omni-bar):**
    *   **Trigger:** `Cmd+K` / `Ctrl+P` (Desktop), 検索アイコン (Mobile)。
    *   **Logic:** Rust (Tantivy等) によるインメモリ全文検索。
    *   **UI (Smart Snippet):**
        *   **Context Aware:** 単にキーワード周辺を切り取るだけでなく、**「文単位」または「段落単位」で意味が通じる範囲**をスニペットとして表示する。
        *   **Dynamic Highlighting:** ヒットしたキーワードをハイライトしつつ、その前後にある関連性の高い文脈も保持して表示する。ユーザーがカードを開かなくても「何を書いたか」を思い出せる品質を目指す。
        *   リスト形式で表示し、選択すると即座にカードが開く。

### 2.5 モバイル統合 (Mobile Integration)
*   **Share Sheet Extension:**
    *   iOS/AndroidのOS標準共有メニューに「Zedi」を表示。
    *   Zediアプリを開かずにバックグラウンドで新規カードを作成・Inbox保存する。

### 2.6 オンボーディング (Seed Content)
*   **Tutorial as Cards:**
    *   「👋 Zediへようこそ」「🔗 リンクの繋ぎ方」などのチュートリアルを、実際のカードデータとしてプリセットする。

### 2.7 同期とデータ管理 (CRDT)
*   **Sync Strategy:**
    *   CRDT (Conflict-free Replicated Data Types) を採用。オフライン完全対応。
*   **Local-First:** SQLiteベース。

---

## 3. 技術スタックとアーキテクチャ

### 3.1 Tech Stack
| 領域 | 技術選定 | 理由 |
| :--- | :--- | :--- |
| **Frontend** | **Solid.js** | 仮想DOMレスによる世界最速クラスの描画パフォーマンス。 |
| **Editor Core** | **solid-tiptap** | Prosemirrorベース。Magic Split等のD&D操作の実装容易性。 |
| **App Framework** | **Tauri 2.0** | Rustバックエンドによる堅牢性、セキュリティ、Mobile対応。 |
| **Local DB** | **SQLite + CR-SQLite** | CRDT拡張を組み込み、分散データベースとして機能させる。 |
| **Search/Logic** | **Rust (Tantivy)** | **文脈抽出ロジック（Smart Snippet）の実装に最適化された検索エンジン。** |

---

## 4. 非機能要件 (Non-Functional Requirements)

*   **Performance:**
    *   起動時間：Desktop 0.5秒以内、Mobile 1.0秒以内。
    *   検索速度：100ms以内。
*   **UX/Usability:**
    *   **Cognitive Load:** 分割（Refactoring）にかかる操作ステップを極限まで減らすこと（Magic Split）。
    *   **Search Clarity:** 検索結果の一覧性において、ユーザーが「カードを開くかどうか」をスニペットだけで判断できる情報密度を確保すること。

---

## 5. 開発ロードマップ (Milestones)

### Phase 1: The Core & Atomic Editor (Foundation)
*   **目標:** ローカル単体で「最高のカード型メモ」として機能し、検索もできる。
*   **実装:**
    *   Tauri + Solid.js + solid-tiptap 環境構築。
    *   「カード」UIの実装。
    *   **Rustによる全文検索エンジンと、文脈考慮型スニペット生成ロジックの実装。**
    *   初期データ（チュートリアルカード）の投入ロジック実装。

### Phase 2: The Sync, Time & Flow (Structure)
*   **目標:** データがデバイス間で矛盾なく同期し、モバイルからも瞬時に情報を放り込める。
*   **実装:**
    *   CRDT同期ロジック (CR-SQLite + Supabase) の実装。
    *   **Time Axis (Mobile Feed)** の実装。
    *   **Mobile Share Sheet の実装。**
    *   Sliding Panes (Desktop UI) の実装。
    *   **Magic Split (Drag & Drop Extract) のUX実装（※AI連携はPhase 3）。**

### Phase 3: The Intelligence (Expansion)
*   **目標:** AIが思考の接続と拡張を加速させる。
*   **実装:**
    *   **AI Titling (Magic Split実行時のタイトル自動生成) の実装。**
    *   Wiki Generator の実装。
    *   RAG (Embedding) によるチャット検索。
    *   Supabase Auth連携と課金管理。