// Database initialization and migration
use tauri_plugin_sql::{Migration, MigrationKind};

/// Get migrations for the cards database
pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "Create cards table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS cards (
                    id TEXT PRIMARY KEY NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL DEFAULT '',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    is_deleted INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at);
                CREATE INDEX IF NOT EXISTS idx_cards_title ON cards(title);
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
                    FOREIGN KEY (source_id) REFERENCES cards(id),
                    FOREIGN KEY (target_id) REFERENCES cards(id)
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
                    source_card_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY (link_text, source_card_id),
                    FOREIGN KEY (source_card_id) REFERENCES cards(id)
                );
            "#,
            kind: MigrationKind::Up,
        },
    ]
}
