// Database initialization and migration
use tauri_plugin_sql::{Migration, MigrationKind};

/// Get migrations for the pages database
pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "Create pages table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS pages (
                    id TEXT PRIMARY KEY NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL DEFAULT '',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    is_deleted INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_pages_created_at ON pages(created_at);
                CREATE INDEX IF NOT EXISTS idx_pages_title ON pages(title);
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "Create links table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS links (
                    source_id TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY (source_id, target_id),
                    FOREIGN KEY (source_id) REFERENCES pages(id),
                    FOREIGN KEY (target_id) REFERENCES pages(id)
                );
            "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "Create ghost_links table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS ghost_links (
                    link_text TEXT NOT NULL,
                    source_page_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY (link_text, source_page_id),
                    FOREIGN KEY (source_page_id) REFERENCES pages(id)
                );
            "#,
            kind: MigrationKind::Up,
        },
    ]
}
