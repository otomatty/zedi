# Product Requirements Document (PRD): Zedi

| 項目 | 内容 |
| :--- | :--- |
| **Product Name** | **Zedi** |
| **Version** | 1.0 (Initial Draft) |
| **Platform** | Desktop (Windows, macOS, Linux), Mobile (iOS, Android) |
| **Core Concept** | **"Thought at the speed of light"**<br>あらゆるアプリよりも手軽に起動し、整理を強要せず、AIとリンクで知識を拡張する。 |
| **Target User** | 高速な思考のキャプチャと、膨大な知識の緩やかな結合を求めるナレッジワーカー、エンジニア、研究者。 |

---

## 1. 製品ビジョンと体験 (UX)

### 1.1 デザイン原則
*   **Speed First:** 起動時間は0秒を目指す。入力までのタップ数・キーストロークを最小化する。
*   **No Folders, Just Links:** フォルダによる階層化を行わず、リンクによるネットワーク構造で管理する。
*   **Local First:** オフラインで完全に動作し、オンライン時に背景で同期する。
*   **Augmented Thinking:** AIは勝手に編集せず、ユーザーの思考を補助（Wiki生成、検索、リンク提案）する役割に徹する。

### 1.2 主要なユーザーフロー
1.  **起動:** ホットキーまたはウィジェットから瞬時にエディタが開く。
2.  **入力:** Notion風のブロックエディタでテキスト、コード、メディアを入力。
3.  **Wiki生成:** 「Wiki生成」を実行すると、AIが内容を補完・生成する。
4.  **リンク化:** 生成されたテキスト内のキーワードが、Rustアルゴリズムにより瞬時に「リンク候補（点線）」としてハイライトされる。ユーザーはクリックでリンクを確定する。
5.  **探索:** ページ下部に「このページへのリンク（Backlinks）」と「そのリンク元のリンク先（2-hop Links）」が表示され、意外な関連性を発見する。

---

## 2. 機能要件 (Functional Requirements)

### 2.1 起動とアクセシビリティ
*   **Desktop:**
    *   グローバルホットキー（例: `Alt+Space`）によるクイック入力ウィンドウの呼び出し。
    *   システムトレイ常駐によるバックグラウンド待機。
*   **Mobile:**
    *   Tauri 2.0最適化によるコールドスタート高速化。
    *   ホーム画面ウィジェット、共有メニュー（Share Extension）からのテキスト取り込み。

### 2.2 エディタ機能
*   **Block-based Editor:** Notionライクな操作感（`/` コマンド対応）。
    *   テキスト（H1-H3, Quote, List, Toggleなど）。
    *   メディア埋め込み（画像, 動画, 音声, PDF）。**※手書き描画は非対応**。
*   **Markdown Support:** Markdown記法での入力とエクスポート。

### 2.3 ネットワークとリンク管理
*   **Structure:** フラットなデータベース構造。
*   **Entry Points (Workspaces):** 「仕事」「個人」など、表示フィルタリング用のビュー（エントリーポイント）を作成可能。
*   **Internal Links:** `[[Page Title]]` 記法による相互リンク。
*   **Network Visualization (Footer UI):**
    *   **Direct Links:** このページがリンクしている先。
    *   **Backlinks:** このページにリンクしている元。
    *   **Grandchild Links (2-hop):** リンク先のページが、さらにどこへリンクしているかを表示。

### 2.4 AI機能 (BYOK: Bring Your Own Key)
*   **Settings:** ユーザーが自身のOpenAI / Anthropic APIキーを入力・保存する。
*   **Wiki Generator:**
    *   タイトルや一部の行から、Wikipedia風の解説記事を生成して追記する。
*   **Link Suggestions (Rust Backend):**
    *   **ロジック:** Rust側で全ページタイトルをトライ木（Aho-Corasick法など）で保持。表示中のテキストを高速スキャンし、既存ページ名と一致する箇所を特定する。
    *   **UI:** 候補テキストを「点線アンダーライン」等の別スタイルで表示。クリックで`[[ ]]`リンクへ変換。自動リンク化はしない。
*   **Chat Search (RAG):**
    *   ユーザーの承認のもと、Embedding APIを使用してローカル/リモートDBのベクトル化を行う。チャット形式で過去のメモを検索可能。

### 2.5 認証と同期
*   **Auth:** Supabase Auth (Google OAuth, Passkeys)。
*   **Sync:**
    *   **Local-first:** 読み書きは全てローカルSQLiteに行う。
    *   **Background Sync:** ネットワーク接続時にSupabase (PostgreSQL) と差分同期。

---

## 3. 技術スタックとアーキテクチャ

### 3.1 Tech Stack
| 領域 | 技術選定 | 理由 |
| :--- | :--- | :--- |
| **Frontend** | **Solid.js** | 仮想DOMを持たず、Signalによる直接DOM操作で最速の描画パフォーマンスを実現。 |
| **App Framework** | **Tauri 2.0** | Rustバックエンドによる堅牢性と、WebView利用による軽量・クロスプラットフォーム対応（Mobile含む）。 |
| **Local DB** | **SQLite** | オフライン動作の基盤。Tauri Plugin経由でRustから高速アクセス。 |
| **Remote DB** | **Supabase** | PostgreSQL + pgvector (AI用) + Edge Functions。 |
| **Search/Algorithm** | **Rust** | 全文検索、およびリンク候補マッチング処理（Aho-Corasick等）の高速実行。 |

### 3.2 データモデル (Schema Design)

**Local (SQLite) & Remote (PostgreSQL) 共通スキーマ**

```sql
-- 1. ビュー/フィルター定義（ノートブック的役割）
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    created_at DATETIME
);

-- 2. ページ（情報の最小単位）
CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace_id TEXT, -- 所属ビュー（オプション）
    title TEXT NOT NULL,
    content TEXT,      -- JSON Block Data
    vector BLOB,       -- Embedding Vector (Sync対象だがLocal検索では未使用)
    updated_at DATETIME,
    is_deleted BOOLEAN DEFAULT 0
);
CREATE INDEX idx_pages_title ON pages(title); -- Rustでの検索用

-- 3. リンク関係（グラフ構造）
CREATE TABLE links (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    created_at DATETIME,
    FOREIGN KEY(source_id) REFERENCES pages(id),
    FOREIGN KEY(target_id) REFERENCES pages(id),
    PRIMARY KEY (source_id, target_id)
);
```

---

## 4. 非機能要件 (Non-Functional Requirements)

*   **Performance:**
    *   アプリ起動時間：1秒以内（Desktop常駐時は0秒）。
    *   リンク候補ハイライト処理：テキスト量1万字程度でも100ms以内に完了すること（UIブロッキングなし）。
*   **Security:**
    *   APIキーはOSのキーストア（Tauri Store Plugin + Stronghold等）に暗号化して保存。
    *   同期通信はSSL/TLSで暗号化。
*   **Data Integrity:**
    *   競合解決（Conflict Resolution）は「Last Write Wins（最後に書いた方が勝ち）」を基本とし、複雑なマージは行わない（シンプルさ優先）。

---

## 5. 開発ロードマップ (Milestones)

### Phase 1: Core Engine (Local-first MVP)
*   Tauri + Solid.js 環境構築。
*   SQLite連携とCRUD処理の実装。
*   ブロックエディタの基本実装。
*   **Rustによる「リンク候補ハイライト（Aho-Corasick）」の実装。**

### Phase 2: Network & UX
*   `[[ ]]` リンク機能とページ遷移の実装。
*   バックリンク、孫リンク（2-hop）のクエリとUI実装。
*   ワークスペース（ビュー）切り替え機能。

### Phase 3: AI & Cloud Sync
*   Supabase Auth連携。
*   Local-Remote同期ロジック（Conflict処理含む）。
*   AI設定画面とWiki生成プロンプトの実装。
*   Embedding & RAG検索の実装。

---

このPRDをベースに、Phase 1の実装へ着手することが可能です。要件に不足や修正したい箇所はありますか？