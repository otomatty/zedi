// Card CRUD operations using Tauri commands
mod database;
mod link_detector;
mod models;
mod search;

use link_detector::LinkDetector;
use search::SearchEngine;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::Manager;

// Global singletons for search engine and link detector
static SEARCH_ENGINE: OnceLock<SearchEngine> = OnceLock::new();
static LINK_DETECTOR: OnceLock<LinkDetector> = OnceLock::new();

fn get_search_engine() -> &'static SearchEngine {
    SEARCH_ENGINE.get().expect("Search engine not initialized")
}

fn get_link_detector() -> &'static LinkDetector {
    LINK_DETECTOR.get().expect("Link detector not initialized")
}

/// Create a new card
#[tauri::command]
async fn create_card(input: models::CreateCardInput) -> Result<models::Card, String> {
    let now = chrono::Utc::now().timestamp();
    let card = models::Card {
        id: uuid::Uuid::new_v4().to_string(),
        title: input.title.clone(),
        content: input.content.clone(),
        created_at: now,
        updated_at: now,
        is_deleted: false,
    };

    // Index the new card
    get_search_engine().index_card(&card.id, &card.title, &card.content)?;

    // Add title to link detector
    if !card.title.is_empty() {
        get_link_detector().add_pattern(card.title.clone())?;
    }

    Ok(card)
}

/// Get all cards (non-deleted) ordered by created_at desc
#[tauri::command]
async fn get_cards(_limit: Option<u32>, _offset: Option<u32>) -> Result<Vec<models::Card>, String> {
    // TODO: Implement actual database query
    // For now, return empty vector
    Ok(vec![])
}

/// Get a single card by ID
#[tauri::command]
async fn get_card_by_id(_id: String) -> Result<Option<models::Card>, String> {
    // TODO: Implement actual database query
    Ok(None)
}

/// Update an existing card
#[tauri::command]
async fn update_card(input: models::UpdateCardInput) -> Result<models::Card, String> {
    let now = chrono::Utc::now().timestamp();
    // TODO: Implement actual database update
    let card = models::Card {
        id: input.id.clone(),
        title: input.title.clone(),
        content: input.content.clone(),
        created_at: now, // This should come from DB
        updated_at: now,
        is_deleted: false,
    };

    // Re-index the updated card
    get_search_engine().index_card(&card.id, &card.title, &card.content)?;

    // Update link detector patterns
    // Note: In production, we'd need to track the old title to remove it
    if !card.title.is_empty() {
        get_link_detector().add_pattern(card.title.clone())?;
    }

    Ok(card)
}

/// Soft delete a card
#[tauri::command]
async fn soft_delete_card(id: String) -> Result<(), String> {
    // TODO: Implement actual database soft delete

    // Remove from search index
    get_search_engine().delete_card(&id)?;

    Ok(())
}

/// Search cards by query string
#[tauri::command]
async fn search_cards(query: String, limit: Option<usize>) -> Result<Vec<search::SearchResult>, String> {
    let limit = limit.unwrap_or(20);
    get_search_engine().search(&query, limit)
}

/// Get link suggestions for text
#[tauri::command]
async fn get_link_suggestions(text: String) -> Result<Vec<link_detector::LinkSuggestion>, String> {
    get_link_detector().find_matches(&text)
}

/// Update link detector patterns with all card titles
#[tauri::command]
async fn update_link_patterns(titles: Vec<String>) -> Result<(), String> {
    get_link_detector().update_patterns(titles)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:zedi.db", database::get_migrations())
                .build(),
        )
        .setup(|app| {
            // Initialize search engine with app data directory
            let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
            let index_path = app_data_dir.join("search_index");

            let engine = SearchEngine::new(index_path)
                .unwrap_or_else(|_| SearchEngine::new_in_memory().unwrap());
            SEARCH_ENGINE.set(engine).ok();

            // Initialize link detector
            LINK_DETECTOR.set(LinkDetector::new()).ok();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_card,
            get_cards,
            get_card_by_id,
            update_card,
            soft_delete_card,
            search_cards,
            get_link_suggestions,
            update_link_patterns,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

