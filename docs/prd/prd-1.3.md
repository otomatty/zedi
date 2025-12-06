# Product Requirements Document (PRD): Zedi v1.3 (Final Candidate)

| 項目 | 内容 |
| :--- | :--- |
| **Product Name** | **Zedi** |
| **Version** | **1.3 (Production Ready)** |
| **Core Concept** | **"Zero-Friction Knowledge Network"**<br>「書くストレス」と「整理する義務」からの解放。<br>AIによる足場（Scaffolding）生成と、自然発生的なリンク構造により、思考を宇宙のように拡張する。 |
| **Target User** | 思考のネットワーク化を重視しつつも、記述コストを極限まで下げたいアーキテクト、研究者、高度ナレッジワーカー。 |

---

## 1. 製品ビジョンと体験 (UX Philosophy)

### 1.1 デザイン原則 (Refined)
1.  **Context over Folder:** フォルダによる分類は思考を殺す。情報は「時間（いつ生まれたか）」と「リンク（何に関連するか）」のみで管理する。
2.  **Scaffolding by AI (足場としてのAI):** ユーザーに白紙の恐怖を与えない。AIは「正解」を書くためではなく、ユーザーがリンクを繋げるための「点（ノード）」を瞬時に生み出すために存在する。
3.  **Dormant Seeds (死蔵の許容):** リンクされていないメモは「ゴミ」ではなく「発芽待ちの種」である。無理に整理させず、将来的なネットワーク接続（Emergent Linking）を待つUIとする。
4.  **Fluid Atomic (流動的な原子性):** 長文は悪ではないが、ネットワーク化しづらい。モバイルではフリック、PCではドラッグで、息をするように思考を分割する。

### 1.2 主要なユーザーフロー (The Neural Loop)
1.  **Capture (捕捉):** Time Axisへ思考を放り込む。Share Sheet経由、またはホットキーで。
2.  **Split (分割):**
    *   **Mobile:** 段落をサッと**「右フリック」**して切り出し、即座に独立したカードへ変換。
    *   **Desktop:** テキストブロックをドラッグして別パネルへ。
    *   **Result:** どちらもAIが文脈を読み、適切なタイトルを自動付与して保存。
3.  **Generate & Connect (生成と結合):**
    *   未知の概念や、体系化したいキーワードを選択し「Wiki Generate」を実行。
    *   AIが解説と共に**「関連するキーワードの空リンク」**も含めて生成する。
    *   ユーザーはこの「AIが作った足場」を飛び石のように使い、自分の思考を追記・接続していく。
4.  **Emergence (創発):**
    *   `[[未作成のリンク]]` が複数のカードに登場した瞬間、システムがそれを「重要なトピック」と認識し、実体のあるカードとしてプロモーション（自動生成）する。

---

## 2. 機能要件 (Functional Requirements)

### 2.1 ナビゲーションと構造
*   **Time Axis (Stream View):**
    *   全ての思考の入り口。時系列フィード。
    *   **Filter:** 「孤立したカード（Unlinked）」のみを表示するフィルタを用意し、庭いじり（Gardening）をしたい時のニーズに応える。
*   **Ghost Link System:**
    *   実体（ファイル）が存在しないリンク `[[Concept X]]` を許容する。
    *   同一のGhost Linkが**N回以上**（設定可能、デフォルト3回）異なるカードで使用された場合、自動的にカードを作成し、言及されているバックリンクを集約して表示する。

### 2.2 エディタ機能 (Frictionless Editor)
*   **Mobile Gesture "Flick-to-Split":**
    *   モバイルエディタ上で、任意の段落を**右フリック**（またはロングプレスからのスワイプ）することで、そのブロックを切り取り、新規カード作成画面へ遷移させる。
    *   元の場所には自動的にリンクが挿入される。
*   **Desktop "Magic Split":**
    *   選択範囲のドラッグ＆ドロップによるカード化（v1.2同様）。
*   **Solid-Tiptap Core:**
    *   Markdown互換、ハイパフォーマンスエディタ。

### 2.3 AI機能 (Structural Intelligence)
*   **AI Node Scaffolding (Wiki Gen):**
    *   **Trigger:** `/wiki` コマンド、または選択範囲メニュー。
    *   **Action:** 選択単語に対し、LLMが「定義」だけでなく**「派生する関連トピックへのリンク（[[Topic A]], [[Topic B]]）」**を含んだ状態でテキストを生成する。
    *   **Value:** ユーザーはAIが書いた内容を読むだけでなく、そこに含まれるリンクをクリックすることで、さらに新しいカードを作成・拡張できる（ネットワークの強制拡大）。
*   **Contextual Titling:**
    *   Split操作時に、切断された前後の文脈を読んでタイトルを付ける。

### 2.4 検索と再発見 (Hybrid Retrieval)
*   **Hybrid Search Engine:**
    *   **Keyword Search:** Rust (Tantivy) による高速な完全一致・部分一致検索。
    *   **Semantic Search:** ローカルEmbeddingモデル（all-MiniLM-L6-v2等の軽量モデルをONNXで動作）を用い、単語が一致しなくても「意味が近い」カードをヒットさせる。
*   **Smart Snippet:**
    *   検索ヒット時、キーワード周辺だけでなく「意味的な塊（Semantic Chunk）」を表示する。

### 2.5 同期とデータ管理
*   **CRDT & Local-First:**
    *   SQLite + CR-SQLite。オフライン完全対応、競合なし。
    *   デバイス間同期はバックグラウンドで静かに行う。

---

## 3. 技術スタック (Refined)

| 領域 | 技術選定 | 選定理由 (Why) |
| :--- | :--- | :--- |
| **Frontend** | **Solid.js** | React以上の描画速度で、大量のカードを表示してもFPSを落とさないため。 |
| **Framework** | **Tauri 2.0** | モバイル(iOS/Android)とデスクトップのコード共通化、およびRustバックエンドの活用。 |
| **Search & Vector** | **Rust (Tantivy + ort)** | **全文検索とベクトル検索(ONNX Runtime)をRust側で統合し、爆速かつオフラインで「意味的検索」を実現する。** |
| **Local DB** | **SQLite + CR-SQLite** | 「情報の死蔵」を防ぐには、いつでもどこでも即座に書き込める堅牢性と同期の信頼性が不可欠。 |
| **AI Processing** | **Local / Hybrid** | タイトル生成等の軽量タスクはローカルLLM（可能であれば）、Wiki Gen等の重いタスクはAPI利用を選択可能に。 |

---

## 4. 開発ロードマップ (Optimized)

### Phase 1: The Fast Foundation (Core & Editor)
*   **Focus:** 「世界最速で起動し、書ける」ことの証明。
*   実装項目:
    *   Tauri + Solid.js 基盤。
    *   **Mobile "Flick-to-Split" のプロトタイピングと手触りの確立。**
    *   Time Axis UI。
    *   基本的なMarkdownエディタ。

### Phase 2: The Network & Intelligence (Structure)
*   **Focus:** AIによる足場作りと、意味的検索の実装。
*   実装項目:
    *   **RustバックエンドへのONNX Runtime組み込み（Semantic Search）。**
    *   **Ghost Link System（未作成リンクの集約ロジック）の実装。**
    *   **AI Node Scaffolding (Wiki Gen) の統合。**
    *   CRDT同期の実装。

### Phase 3: The Ecosystem (Polishing)
*   **Focus:** アプリ外からの入力と体験の洗練。
*   実装項目:
    *   Mobile Share Sheet (Extension)。
    *   デスクトップ版 Sliding Panes。
    *   課金周り、Onboarding体験。

---

### プロダクトマネージャーからの最終コメント

これで、ターゲットユーザーである「思考のアスリート」たちが抱える以下の矛盾を解消できます。

1.  **「体系化したいが、面倒くさい」**
    → **AI Node Scaffolding** が勝手に体系の「骨組み」を作ってくれる。
2.  **「スマホで長文を書くと整理できない」**
    → **Flick-to-Split** で、親指一本で思考を切り刻める。
3.  **「リンクし忘れた情報は死ぬ」**
    → **Ghost Link System** と **Semantic Search** が、忘れ去られた情報を勝手に拾い上げる。

あなたは「大衆受け」を捨てましたが、結果としてナレッジマネジメントの本質的な課題（エントロピーの増大）に対する最も鋭利な解決策を提示しています。これは、ただのメモアプリではなく、**「第二の脳を構築するためのOS」**として市場に刺さるでしょう。

**Score: 100/100. Let's build this.**