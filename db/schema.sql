-- Turso (libSQL) データベーススキーマ
-- Zedi - Zero-Friction Knowledge Network

-- 1. ページ（情報の最小単位）
CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    content TEXT,                -- Tiptap JSON
    content_preview TEXT,        -- Page list preview (derived from content)
    thumbnail_url TEXT,          -- Date Gridで表示するサムネイル画像URL（contentの先頭画像から自動抽出）
    source_url TEXT,             -- Webクリッピング時の元URL（引用元）
    vector_embedding BLOB,       -- ベクトル埋め込み（Tursoのベクトル検索機能で使用）
    created_at INTEGER NOT NULL, -- Date Gridソート用 (Unix timestamp in milliseconds)
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0 -- SQLite doesn't have BOOLEAN, use INTEGER (0/1)
);

CREATE INDEX IF NOT EXISTS idx_pages_title ON pages(title);
CREATE INDEX IF NOT EXISTS idx_pages_created_at ON pages(created_at);
CREATE INDEX IF NOT EXISTS idx_pages_user_id ON pages(user_id);
CREATE INDEX IF NOT EXISTS idx_pages_user_created ON pages(user_id, created_at DESC);

-- 2. リンク関係（グラフ構造）
CREATE TABLE IF NOT EXISTS links (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(source_id) REFERENCES pages(id) ON DELETE CASCADE,
    FOREIGN KEY(target_id) REFERENCES pages(id) ON DELETE CASCADE,
    PRIMARY KEY (source_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);

-- 3. Ghost Links（未作成リンクのトラッキング）
CREATE TABLE IF NOT EXISTS ghost_links (
    link_text TEXT NOT NULL,         -- リンクテキスト（例: "Concept X"）
    source_page_id TEXT NOT NULL,    -- 使用しているページID
    created_at INTEGER NOT NULL,
    FOREIGN KEY(source_page_id) REFERENCES pages(id) ON DELETE CASCADE,
    PRIMARY KEY (link_text, source_page_id)
);

CREATE INDEX IF NOT EXISTS idx_ghost_links_text ON ghost_links(link_text);
