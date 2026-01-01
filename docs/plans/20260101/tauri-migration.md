# 実装計画書: Tauri 2.0 Migration（デスクトップアプリ化）

## 概要

| 項目       | 内容                                                                                 |
| :--------- | :----------------------------------------------------------------------------------- |
| **機能名** | Tauri 2.0 Migration（Web App → Desktop App）                                         |
| **目的**   | Rustバックエンドによる高速化、オフライン対応、ネイティブ機能の活用                   |
| **優先度** | 🔴 必須（Phase 6 のコア作業）                                                        |
| **前提条件** | Phase 1-5 の機能が安定していること                                                  |

---

## 移行戦略

### 段階的アプローチ

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Step 1: Tauri 基盤構築                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • Tauri 2.0 プロジェクト初期化                                  │   │
│  │ • 既存 React コードの統合                                       │   │
│  │ • 開発環境の構築                                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  Step 2: データベース移行                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • libSQL (Turso embedded) への移行                              │   │
│  │ • Rust コマンド経由のDB操作                                     │   │
│  │ • オフラインファースト対応                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  Step 3: ネイティブ機能                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • グローバルホットキー                                          │   │
│  │ • システムトレイ                                                │   │
│  │ • APIキーの安全な保存                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              ↓                                          │
│  Step 4: 高速検索エンジン                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ • Tantivy 全文検索                                              │   │
│  │ • Aho-Corasick リンク候補検出                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Tauri 基盤構築

### 1.1 プロジェクト初期化

```bash
# Tauri CLI のインストール
cargo install tauri-cli --version "^2.0"

# 既存プロジェクトに Tauri を追加
cd /path/to/zedi
cargo tauri init
```

### 1.2 ディレクトリ構造

```
zedi/
├── src/                          # 既存のReactコード（変更なし）
│   ├── App.tsx
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── ...
├── src-tauri/                    # Tauri バックエンド（新規）
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs               # エントリーポイント
│   │   ├── lib.rs                # モジュール定義
│   │   ├── commands/             # Tauri コマンド
│   │   │   ├── mod.rs
│   │   │   ├── database.rs       # DB操作
│   │   │   ├── search.rs         # 検索
│   │   │   └── keystore.rs       # 鍵管理
│   │   ├── database/             # データベース
│   │   │   ├── mod.rs
│   │   │   ├── migrations.rs
│   │   │   └── repository.rs
│   │   └── search/               # 検索エンジン
│   │       ├── mod.rs
│   │       ├── tantivy.rs
│   │       └── aho_corasick.rs
│   └── icons/                    # アプリアイコン
├── package.json                  # 更新（Tauri スクリプト追加）
├── vite.config.ts                # 更新（Tauri 対応）
└── tauri.conf.json               # Tauri 設定
```

### 1.3 package.json の更新

```json
{
  "scripts": {
    "dev": "vite",
    "dev:tauri": "tauri dev",
    "build": "vite build",
    "build:tauri": "tauri build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@tauri-apps/api": "^2.0.0"
  }
}
```

### 1.4 vite.config.ts の更新

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  // Tauri expects a fixed port in dev mode
  server: {
    host: "localhost",
    port: 1420,
    strictPort: true,
  },
  // Tauri config
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux
    target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari13",
    // Don't minify for better error messages in dev
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
```

### 1.5 tauri.conf.json

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Zedi",
  "version": "0.1.0",
  "identifier": "com.zedi.app",
  "build": {
    "beforeDevCommand": "bun run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "bun run build",
    "frontendDist": "../dist"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "Zedi",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    },
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "globalShortcut": {
      "enabled": true
    }
  }
}
```

---

## Step 2: データベース移行

### 2.1 現在の構成

```
┌─────────────────────────────────────────────────────────────┐
│  現在（Web App）                                            │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   React App     │───▶│   sql.js        │                │
│  │   (Frontend)    │    │   (In-Memory)   │                │
│  └─────────────────┘    └─────────────────┘                │
│                               │                            │
│                               ▼                            │
│                    ┌─────────────────┐                     │
│                    │   IndexedDB     │                     │
│                    │   (Persistence) │                     │
│                    └─────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 移行後の構成

```
┌─────────────────────────────────────────────────────────────┐
│  移行後（Tauri App）                                        │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   React App     │◀──▶│   Tauri IPC     │                │
│  │   (WebView)     │    │   (Commands)    │                │
│  └─────────────────┘    └─────────────────┘                │
│                               │                            │
│                               ▼                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Rust Backend                      │   │
│  │  ┌───────────────┐  ┌───────────────┐              │   │
│  │  │   libSQL      │  │   Tantivy     │              │   │
│  │  │   (Turso)     │  │   (Search)    │              │   │
│  │  └───────────────┘  └───────────────┘              │   │
│  └─────────────────────────────────────────────────────┘   │
│                               │                            │
│                               ▼                            │
│                    ┌─────────────────┐                     │
│                    │   Local SQLite  │                     │
│                    │   (~/.zedi/db)  │                     │
│                    └─────────────────┘                     │
│                               │                            │
│                               ▼ (Online時)                 │
│                    ┌─────────────────┐                     │
│                    │   Turso Cloud   │                     │
│                    │   (Sync)        │                     │
│                    └─────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Rust コマンド実装

```rust
// src-tauri/src/commands/database.rs

use libsql::{Builder, Database};
use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct Page {
    pub id: String,
    pub user_id: String,
    pub title: String,
    pub content: String,
    pub thumbnail_url: Option<String>,
    pub source_url: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub is_deleted: bool,
}

pub struct DbState {
    pub db: Mutex<Database>,
}

#[tauri::command]
pub async fn get_pages(
    user_id: &str,
    state: State<'_, DbState>,
) -> Result<Vec<Page>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, user_id, title, content, thumbnail_url, source_url, 
                    created_at, updated_at, is_deleted 
             FROM pages 
             WHERE user_id = ? AND is_deleted = 0 
             ORDER BY created_at DESC"
        )
        .await
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query([user_id])
        .await
        .map_err(|e| e.to_string())?;

    let mut pages = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| e.to_string())? {
        pages.push(Page {
            id: row.get(0).map_err(|e| e.to_string())?,
            user_id: row.get(1).map_err(|e| e.to_string())?,
            title: row.get(2).map_err(|e| e.to_string())?,
            content: row.get(3).map_err(|e| e.to_string())?,
            thumbnail_url: row.get(4).ok(),
            source_url: row.get(5).ok(),
            created_at: row.get(6).map_err(|e| e.to_string())?,
            updated_at: row.get(7).map_err(|e| e.to_string())?,
            is_deleted: row.get::<i64>(8).map_err(|e| e.to_string())? != 0,
        });
    }

    Ok(pages)
}

#[tauri::command]
pub async fn create_page(
    user_id: &str,
    title: &str,
    content: &str,
    state: State<'_, DbState>,
) -> Result<Page, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;

    let id = nanoid::nanoid!();
    let now = chrono::Utc::now().timestamp_millis();

    conn.execute(
        "INSERT INTO pages (id, user_id, title, content, created_at, updated_at, is_deleted) 
         VALUES (?, ?, ?, ?, ?, ?, 0)",
        [&id, user_id, title, content, &now.to_string(), &now.to_string()],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(Page {
        id,
        user_id: user_id.to_string(),
        title: title.to_string(),
        content: content.to_string(),
        thumbnail_url: None,
        source_url: None,
        created_at: now,
        updated_at: now,
        is_deleted: false,
    })
}

#[tauri::command]
pub async fn update_page(
    user_id: &str,
    page_id: &str,
    title: &str,
    content: &str,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp_millis();

    conn.execute(
        "UPDATE pages SET title = ?, content = ?, updated_at = ? 
         WHERE id = ? AND user_id = ?",
        [title, content, &now.to_string(), page_id, user_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_page(
    user_id: &str,
    page_id: &str,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp_millis();

    conn.execute(
        "UPDATE pages SET is_deleted = 1, updated_at = ? 
         WHERE id = ? AND user_id = ?",
        [&now.to_string(), page_id, user_id],
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}
```

### 2.4 フロントエンド側の呼び出し

```typescript
// lib/tauriPageRepository.ts

import { invoke } from "@tauri-apps/api/core";
import type { Page } from "@/types/page";

export class TauriPageRepository {
  constructor(private userId: string) {}

  async getPages(): Promise<Page[]> {
    return await invoke<Page[]>("get_pages", { userId: this.userId });
  }

  async createPage(title: string, content: string): Promise<Page> {
    return await invoke<Page>("create_page", {
      userId: this.userId,
      title,
      content,
    });
  }

  async updatePage(
    pageId: string,
    updates: Partial<Pick<Page, "title" | "content">>
  ): Promise<void> {
    await invoke("update_page", {
      userId: this.userId,
      pageId,
      title: updates.title ?? "",
      content: updates.content ?? "",
    });
  }

  async deletePage(pageId: string): Promise<void> {
    await invoke("delete_page", {
      userId: this.userId,
      pageId,
    });
  }
}
```

### 2.5 環境検出とリポジトリ切り替え

```typescript
// hooks/useRepository.ts

import { TauriPageRepository } from "@/lib/tauriPageRepository";
import { LocalPageRepository } from "@/lib/localPageRepository";

export function useRepository() {
  const isTauri = "__TAURI__" in window;

  const getRepository = useCallback(async () => {
    if (isTauri) {
      // Tauri 環境では Rust バックエンドを使用
      return new TauriPageRepository(userId);
    } else {
      // Web 環境では既存の sql.js を使用
      return new LocalPageRepository(await initLocalDatabase());
    }
  }, [userId, isTauri]);

  return { getRepository, isTauri };
}
```

---

## Step 3: ネイティブ機能

### 3.1 グローバルホットキー

```rust
// src-tauri/src/main.rs

use tauri::{
    GlobalShortcutManager, Manager, WindowEvent,
};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // グローバルホットキー: Alt+Space
            let window = app.get_window("main").unwrap();
            
            app.global_shortcut_manager()
                .register("Alt+Space", move || {
                    if window.is_visible().unwrap() {
                        window.hide().unwrap();
                    } else {
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                })
                .expect("Failed to register global shortcut");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3.2 システムトレイ

```rust
// src-tauri/src/tray.rs

use tauri::{
    AppHandle, CustomMenuItem, SystemTray, SystemTrayEvent, 
    SystemTrayMenu, SystemTrayMenuItem,
};

pub fn create_tray() -> SystemTray {
    let quit = CustomMenuItem::new("quit".to_string(), "終了");
    let show = CustomMenuItem::new("show".to_string(), "Zedi を開く");
    let new_page = CustomMenuItem::new("new_page".to_string(), "新規ページ");

    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(new_page)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    SystemTray::new().with_menu(tray_menu)
}

pub fn handle_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick { .. } => {
            let window = app.get_window("main").unwrap();
            window.show().unwrap();
            window.set_focus().unwrap();
        }
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "quit" => {
                std::process::exit(0);
            }
            "show" => {
                let window = app.get_window("main").unwrap();
                window.show().unwrap();
                window.set_focus().unwrap();
            }
            "new_page" => {
                let window = app.get_window("main").unwrap();
                window.show().unwrap();
                window.set_focus().unwrap();
                // フロントエンドに新規ページ作成イベントを送信
                window.emit("create-new-page", ()).unwrap();
            }
            _ => {}
        },
        _ => {}
    }
}
```

### 3.3 安全なAPIキー保存

```rust
// src-tauri/src/commands/keystore.rs

use tauri::State;
use keyring::Entry;

const SERVICE_NAME: &str = "com.zedi.app";

#[tauri::command]
pub fn store_api_key(provider: &str, key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, provider)
        .map_err(|e| e.to_string())?;
    
    entry.set_password(key).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn get_api_key(provider: &str) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_NAME, provider)
        .map_err(|e| e.to_string())?;
    
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_api_key(provider: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, provider)
        .map_err(|e| e.to_string())?;
    
    entry.delete_credential().map_err(|e| e.to_string())?;
    
    Ok(())
}
```

---

## Step 4: 高速検索エンジン

### 4.1 Tantivy 全文検索

```rust
// src-tauri/src/search/tantivy.rs

use tantivy::{
    collector::TopDocs,
    query::QueryParser,
    schema::{Schema, STORED, TEXT},
    Document, Index, ReloadPolicy,
};
use std::path::PathBuf;

pub struct SearchEngine {
    index: Index,
    schema: Schema,
}

impl SearchEngine {
    pub fn new(index_path: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        let mut schema_builder = Schema::builder();
        
        schema_builder.add_text_field("id", STORED);
        schema_builder.add_text_field("title", TEXT | STORED);
        schema_builder.add_text_field("content", TEXT);
        
        let schema = schema_builder.build();
        let index = Index::create_in_dir(&index_path, schema.clone())?;
        
        Ok(Self { index, schema })
    }

    pub fn index_page(&self, id: &str, title: &str, content: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut index_writer = self.index.writer(50_000_000)?;
        
        let id_field = self.schema.get_field("id").unwrap();
        let title_field = self.schema.get_field("title").unwrap();
        let content_field = self.schema.get_field("content").unwrap();
        
        let mut doc = Document::new();
        doc.add_text(id_field, id);
        doc.add_text(title_field, title);
        doc.add_text(content_field, content);
        
        index_writer.add_document(doc)?;
        index_writer.commit()?;
        
        Ok(())
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<(String, String, f32)>, Box<dyn std::error::Error>> {
        let reader = self.index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommit)
            .try_into()?;
        
        let searcher = reader.searcher();
        
        let title_field = self.schema.get_field("title").unwrap();
        let content_field = self.schema.get_field("content").unwrap();
        
        let query_parser = QueryParser::for_index(&self.index, vec![title_field, content_field]);
        let query = query_parser.parse_query(query)?;
        
        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))?;
        
        let id_field = self.schema.get_field("id").unwrap();
        
        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let doc = searcher.doc(doc_address)?;
            let id = doc.get_first(id_field).unwrap().as_text().unwrap().to_string();
            let title = doc.get_first(title_field).unwrap().as_text().unwrap().to_string();
            results.push((id, title, score));
        }
        
        Ok(results)
    }
}

#[tauri::command]
pub async fn search_pages(
    query: &str,
    limit: usize,
    state: State<'_, SearchEngineState>,
) -> Result<Vec<SearchResult>, String> {
    let engine = state.engine.lock().map_err(|e| e.to_string())?;
    
    let results = engine.search(query, limit).map_err(|e| e.to_string())?;
    
    Ok(results.into_iter().map(|(id, title, score)| {
        SearchResult { id, title, score }
    }).collect())
}
```

### 4.2 Aho-Corasick リンク候補検出

```rust
// src-tauri/src/search/aho_corasick.rs

use aho_corasick::{AhoCorasick, Match};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct LinkSuggestion {
    pub title: String,
    pub start: usize,
    pub end: usize,
}

pub struct LinkMatcher {
    ac: Option<AhoCorasick>,
    titles: Vec<String>,
}

impl LinkMatcher {
    pub fn new() -> Self {
        Self {
            ac: None,
            titles: Vec::new(),
        }
    }

    pub fn update_patterns(&mut self, titles: Vec<String>) {
        if titles.is_empty() {
            self.ac = None;
            self.titles = Vec::new();
            return;
        }

        // 大文字小文字を無視するパターンを構築
        self.ac = Some(
            AhoCorasick::builder()
                .ascii_case_insensitive(true)
                .build(&titles)
                .expect("Failed to build AhoCorasick automaton")
        );
        self.titles = titles;
    }

    pub fn find_matches(&self, text: &str) -> Vec<LinkSuggestion> {
        let Some(ac) = &self.ac else {
            return Vec::new();
        };

        ac.find_iter(text)
            .map(|m: Match| LinkSuggestion {
                title: self.titles[m.pattern().as_usize()].clone(),
                start: m.start(),
                end: m.end(),
            })
            .collect()
    }
}

#[tauri::command]
pub async fn find_link_suggestions(
    text: &str,
    state: State<'_, LinkMatcherState>,
) -> Result<Vec<LinkSuggestion>, String> {
    let matcher = state.matcher.lock().map_err(|e| e.to_string())?;
    Ok(matcher.find_matches(text))
}

#[tauri::command]
pub async fn update_link_patterns(
    titles: Vec<String>,
    state: State<'_, LinkMatcherState>,
) -> Result<(), String> {
    let mut matcher = state.matcher.lock().map_err(|e| e.to_string())?;
    matcher.update_patterns(titles);
    Ok(())
}
```

---

## Cargo.toml

```toml
# src-tauri/Cargo.toml

[package]
name = "zedi"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
tauri = { version = "2.0", features = ["global-shortcut", "system-tray"] }
tauri-plugin-shell = "2.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Database
libsql = "0.5"
tokio = { version = "1", features = ["full"] }

# Search
tantivy = "0.22"
aho-corasick = "1.1"

# Security
keyring = "2.3"

# Utils
chrono = "0.4"
nanoid = "0.4"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

---

## 移行チェックリスト

### Phase 1: 基盤構築

| タスク | 状態 | 見積もり |
| :--- | :--- | :--- |
| Tauri 2.0 プロジェクト初期化 | ⏳ | 2時間 |
| 開発環境の設定（vite.config.ts 等） | ⏳ | 1時間 |
| アプリアイコンの作成 | ⏳ | 1時間 |
| 動作確認（既存 React コードの起動） | ⏳ | 1時間 |

### Phase 2: データベース移行

| タスク | 状態 | 見積もり |
| :--- | :--- | :--- |
| libSQL Rust クレート統合 | ⏳ | 2時間 |
| DB 初期化とマイグレーション | ⏳ | 2時間 |
| Tauri コマンド実装（CRUD） | ⏳ | 4時間 |
| TauriPageRepository 実装 | ⏳ | 2時間 |
| useRepository の環境切り替え | ⏳ | 1時間 |
| 動作確認（DB 操作） | ⏳ | 2時間 |

### Phase 3: ネイティブ機能

| タスク | 状態 | 見積もり |
| :--- | :--- | :--- |
| グローバルホットキー実装 | ⏳ | 2時間 |
| システムトレイ実装 | ⏳ | 2時間 |
| keyring によるAPIキー保存 | ⏳ | 2時間 |
| フロントエンドとの連携 | ⏳ | 1時間 |

### Phase 4: 高速検索エンジン

| タスク | 状態 | 見積もり |
| :--- | :--- | :--- |
| Tantivy インデックス構築 | ⏳ | 3時間 |
| 検索コマンド実装 | ⏳ | 2時間 |
| Aho-Corasick リンク検出 | ⏳ | 2時間 |
| フロントエンドとの統合 | ⏳ | 2時間 |

### Phase 5: ビルド & 配布

| タスク | 状態 | 見積もり |
| :--- | :--- | :--- |
| macOS ビルド設定 | ⏳ | 1時間 |
| Windows ビルド設定 | ⏳ | 1時間 |
| Linux ビルド設定 | ⏳ | 1時間 |
| 自動アップデート設定 | ⏳ | 2時間 |
| コード署名 | ⏳ | 2時間 |

---

## 見積もり合計

| Phase | 見積もり |
| :--- | :--- |
| Phase 1: 基盤構築 | 5時間 |
| Phase 2: データベース移行 | 13時間 |
| Phase 3: ネイティブ機能 | 7時間 |
| Phase 4: 高速検索エンジン | 9時間 |
| Phase 5: ビルド & 配布 | 7時間 |
| **合計** | **約41時間** |

---

## リスクと対策

| リスク | 対策 |
| :--- | :--- |
| Rust 習熟度が不足 | 段階的に実装、Tauri サンプルを参考に |
| libSQL の Rust バインディングの制限 | turso-rs 公式ドキュメントを参照 |
| クロスプラットフォームビルドの複雑さ | GitHub Actions で CI/CD を構築 |
| 既存コードとの互換性問題 | 環境検出で条件分岐、段階的移行 |

---

## 関連ドキュメント

- [PRD: 0. 開発戦略 - Tauri 移行計画](../PRD.md#03-tauri-移行計画)
- [PRD: Phase 6: Tauri Desktop App](../PRD.md#phase-6-tauri-desktop-app)
- [Tauri 2.0 公式ドキュメント](https://v2.tauri.app/)
- [libSQL Rust SDK](https://github.com/tursodatabase/libsql)
