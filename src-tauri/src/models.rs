// Page model representing a single knowledge page
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Page {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: i64,  // Unix timestamp
    pub updated_at: i64,
    pub is_deleted: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePageInput {
    pub title: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdatePageInput {
    pub id: String,
    pub title: String,
    pub content: String,
}

// Link model representing connections between pages
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Link {
    pub source_id: String,
    pub target_id: String,
    pub created_at: i64,
}

// Ghost link model for tracking unresolved links
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GhostLink {
    pub link_text: String,
    pub source_page_id: String,
    pub created_at: i64,
}

// Backwards compatibility type aliases
pub type Card = Page;
pub type CreateCardInput = CreatePageInput;
pub type UpdateCardInput = UpdatePageInput;
