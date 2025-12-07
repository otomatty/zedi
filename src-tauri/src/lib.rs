// Card CRUD operations using Tauri commands
mod database;
mod models;

/// Create a new card
#[tauri::command]
async fn create_card(input: models::CreateCardInput) -> Result<models::Card, String> {
    let now = chrono::Utc::now().timestamp();
    let card = models::Card {
        id: uuid::Uuid::new_v4().to_string(),
        title: input.title,
        content: input.content,
        created_at: now,
        updated_at: now,
        is_deleted: false,
    };
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
        id: input.id,
        title: input.title,
        content: input.content,
        created_at: now, // This should come from DB
        updated_at: now,
        is_deleted: false,
    };
    Ok(card)
}

/// Soft delete a card
#[tauri::command]
async fn soft_delete_card(_id: String) -> Result<(), String> {
    // TODO: Implement actual database soft delete
    Ok(())
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
        .invoke_handler(tauri::generate_handler![
            create_card,
            get_cards,
            get_card_by_id,
            update_card,
            soft_delete_card,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
