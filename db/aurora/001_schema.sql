-- Aurora PostgreSQL DDL for Zedi
-- Based on: docs/specs/zedi-data-structure-spec.md + docs/specs/zedi-rearchitecture-spec.md §14.2
-- Apply to dev Aurora: see db/aurora/README.md

-- =============================================================================
-- Extensions (run first; pg_bigm for Japanese full-text search)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_bigm;

-- =============================================================================
-- 1. users
-- =============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_cognito_sub ON users(cognito_sub);
CREATE INDEX idx_users_email ON users(email);

-- =============================================================================
-- 2. pages
-- =============================================================================
CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
    title TEXT,
    content_preview TEXT,
    thumbnail_url TEXT,
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_pages_owner_id ON pages(owner_id);
CREATE INDEX idx_pages_owner_updated ON pages(owner_id, updated_at DESC);
CREATE INDEX idx_pages_source_page_id ON pages(source_page_id);
CREATE INDEX idx_pages_is_deleted ON pages(owner_id) WHERE NOT is_deleted;

-- =============================================================================
-- 3. notes
-- =============================================================================
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'unlisted', 'restricted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_notes_owner_id ON notes(owner_id);
CREATE INDEX idx_notes_visibility ON notes(visibility);

-- =============================================================================
-- 4. note_pages
-- =============================================================================
CREATE TABLE note_pages (
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    added_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (note_id, page_id)
);

CREATE INDEX idx_note_pages_note_id ON note_pages(note_id);
CREATE INDEX idx_note_pages_page_id ON note_pages(page_id);

-- =============================================================================
-- 5. note_members
-- =============================================================================
CREATE TABLE note_members (
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    member_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
    invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (note_id, member_email)
);

CREATE INDEX idx_note_members_note_id ON note_members(note_id);
CREATE INDEX idx_note_members_email ON note_members(member_email);

-- =============================================================================
-- 6. links
-- =============================================================================
CREATE TABLE links (
    source_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_id, target_id),
    CHECK (source_id != target_id)
);

CREATE INDEX idx_links_source_id ON links(source_id);
CREATE INDEX idx_links_target_id ON links(target_id);

-- =============================================================================
-- 7. ghost_links
-- =============================================================================
CREATE TABLE ghost_links (
    link_text TEXT NOT NULL,
    source_page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    original_target_page_id UUID NULL REFERENCES pages(id) ON DELETE SET NULL,
    original_note_id UUID NULL REFERENCES notes(id) ON DELETE SET NULL,
    PRIMARY KEY (link_text, source_page_id)
);

CREATE INDEX idx_ghost_links_link_text ON ghost_links(link_text);
CREATE INDEX idx_ghost_links_source_page_id ON ghost_links(source_page_id);

-- =============================================================================
-- 8. page_contents (Y.Doc persistence) — §14.2
-- =============================================================================
CREATE TABLE page_contents (
    page_id UUID PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    ydoc_state BYTEA NOT NULL,
    version BIGINT NOT NULL DEFAULT 1,
    content_text TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full-text search index (Japanese: pg_bigm)
CREATE INDEX idx_page_contents_text_bigm
    ON page_contents USING gin (content_text gin_bigm_ops);

-- =============================================================================
-- 9. media — §14.2
-- =============================================================================
CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_id UUID NULL REFERENCES pages(id) ON DELETE SET NULL,
    s3_key TEXT NOT NULL,
    file_name TEXT,
    content_type TEXT,
    file_size BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_owner_id ON media(owner_id);
CREATE INDEX idx_media_page_id ON media(page_id);
