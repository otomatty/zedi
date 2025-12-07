// Search engine module using Tantivy for full-text search
// Provides fast indexing and search capabilities for cards

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::RwLock;
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::{Field, Schema, Value, STORED, TEXT};
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument};

/// Search result containing card info and snippet
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub card_id: String,
    pub title: String,
    pub snippet: String,
    pub highlights: Vec<HighlightRange>,
    pub score: f32,
}

/// Range for highlighting matched text
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HighlightRange {
    pub start: usize,
    pub end: usize,
}

/// Search engine wrapper for Tantivy
pub struct SearchEngine {
    index: Index,
    reader: IndexReader,
    writer: RwLock<IndexWriter>,
    // Schema fields
    id_field: Field,
    title_field: Field,
    content_field: Field,
}

impl SearchEngine {
    /// Create a new search engine with index stored in the given directory
    pub fn new(index_path: PathBuf) -> Result<Self, String> {
        // Define schema
        let mut schema_builder = Schema::builder();
        let id_field = schema_builder.add_text_field("id", TEXT | STORED);
        let title_field = schema_builder.add_text_field("title", TEXT | STORED);
        let content_field = schema_builder.add_text_field("content", TEXT | STORED);
        let schema = schema_builder.build();

        // Create or open index
        std::fs::create_dir_all(&index_path)
            .map_err(|e| format!("Failed to create index directory: {}", e))?;

        let index = Index::create_in_dir(&index_path, schema.clone())
            .or_else(|_| Index::open_in_dir(&index_path))
            .map_err(|e| format!("Failed to create/open index: {}", e))?;

        // Create reader with auto-reload
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| format!("Failed to create reader: {}", e))?;

        // Create writer with 50MB memory budget
        let writer = index
            .writer(50_000_000)
            .map_err(|e| format!("Failed to create writer: {}", e))?;

        Ok(Self {
            index,
            reader,
            writer: RwLock::new(writer),
            id_field,
            title_field,
            content_field,
        })
    }

    /// Create in-memory index for testing
    pub fn new_in_memory() -> Result<Self, String> {
        let mut schema_builder = Schema::builder();
        let id_field = schema_builder.add_text_field("id", TEXT | STORED);
        let title_field = schema_builder.add_text_field("title", TEXT | STORED);
        let content_field = schema_builder.add_text_field("content", TEXT | STORED);
        let schema = schema_builder.build();

        let index = Index::create_in_ram(schema);

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| format!("Failed to create reader: {}", e))?;

        let writer = index
            .writer(50_000_000)
            .map_err(|e| format!("Failed to create writer: {}", e))?;

        Ok(Self {
            index,
            reader,
            writer: RwLock::new(writer),
            id_field,
            title_field,
            content_field,
        })
    }

    /// Index a card (add or update)
    pub fn index_card(&self, id: &str, title: &str, content: &str) -> Result<(), String> {
        let mut writer = self.writer.write().map_err(|e| e.to_string())?;

        // Delete existing document with same ID first
        let term = tantivy::Term::from_field_text(self.id_field, id);
        writer.delete_term(term);

        // Add new document
        writer
            .add_document(doc!(
                self.id_field => id,
                self.title_field => title,
                self.content_field => content,
            ))
            .map_err(|e| format!("Failed to add document: {}", e))?;

        writer
            .commit()
            .map_err(|e| format!("Failed to commit: {}", e))?;

        Ok(())
    }

    /// Delete a card from the index
    pub fn delete_card(&self, id: &str) -> Result<(), String> {
        let mut writer = self.writer.write().map_err(|e| e.to_string())?;

        let term = tantivy::Term::from_field_text(self.id_field, id);
        writer.delete_term(term);

        writer
            .commit()
            .map_err(|e| format!("Failed to commit: {}", e))?;

        Ok(())
    }

    /// Search for cards matching the query
    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<SearchResult>, String> {
        let searcher = self.reader.searcher();

        let query_parser =
            QueryParser::for_index(&self.index, vec![self.title_field, self.content_field]);

        let query = query_parser
            .parse_query(query_str)
            .map_err(|e| format!("Failed to parse query: {}", e))?;

        let top_docs = searcher
            .search(&query, &TopDocs::with_limit(limit))
            .map_err(|e| format!("Search failed: {}", e))?;

        let mut results = Vec::new();

        for (score, doc_address) in top_docs {
            let retrieved_doc: TantivyDocument = searcher
                .doc(doc_address)
                .map_err(|e| format!("Failed to retrieve doc: {}", e))?;

            let id = retrieved_doc
                .get_first(self.id_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let title = retrieved_doc
                .get_first(self.title_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let content = retrieved_doc
                .get_first(self.content_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Extract smart snippet
            let (snippet, highlights) = self.extract_smart_snippet(&content, query_str);

            results.push(SearchResult {
                card_id: id,
                title,
                snippet,
                highlights,
                score,
            });
        }

        Ok(results)
    }

    /// Extract a context-aware snippet with highlights
    fn extract_smart_snippet(&self, content: &str, query: &str) -> (String, Vec<HighlightRange>) {
        let query_lower = query.to_lowercase();
        let query_terms: Vec<&str> = query_lower.split_whitespace().collect();
        let content_lower = content.to_lowercase();

        // Find the first occurrence of any query term
        let mut best_pos: Option<usize> = None;
        for term in &query_terms {
            if let Some(pos) = content_lower.find(term) {
                match best_pos {
                    None => best_pos = Some(pos),
                    Some(current) if pos < current => best_pos = Some(pos),
                    _ => {}
                }
            }
        }

        // Extract snippet around the match (approximately 150 chars)
        let snippet_length = 150;
        let (start, end) = match best_pos {
            Some(pos) => {
                let start = if pos > 50 { pos - 50 } else { 0 };
                let end = (start + snippet_length).min(content.len());
                (start, end)
            }
            None => (0, snippet_length.min(content.len())),
        };

        // Find sentence boundaries
        let snippet_start = content[..start]
            .rfind(|c| c == '。' || c == '.' || c == '\n')
            .map(|i| i + 1)
            .unwrap_or(start);

        let snippet_end = content[end..]
            .find(|c| c == '。' || c == '.' || c == '\n')
            .map(|i| end + i + 1)
            .unwrap_or(end);

        let snippet = &content[snippet_start..snippet_end.min(content.len())];

        // Find highlights within the snippet
        let mut highlights = Vec::new();
        let snippet_lower = snippet.to_lowercase();
        for term in &query_terms {
            let mut search_start = 0;
            while let Some(pos) = snippet_lower[search_start..].find(term) {
                let actual_pos = search_start + pos;
                highlights.push(HighlightRange {
                    start: actual_pos,
                    end: actual_pos + term.len(),
                });
                search_start = actual_pos + 1;
            }
        }

        // Sort highlights by position
        highlights.sort_by_key(|h| h.start);

        (snippet.to_string(), highlights)
    }

    /// Reload the reader to see recent changes (for testing)
    #[cfg(test)]
    pub fn reload_reader(&self) -> Result<(), String> {
        self.reader.reload().map_err(|e| format!("Failed to reload: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_index_and_search() {
        let engine = SearchEngine::new_in_memory().unwrap();

        engine
            .index_card("1", "Rust Programming", "Rust is a systems programming language")
            .unwrap();
        engine
            .index_card("2", "JavaScript", "JavaScript is a web programming language")
            .unwrap();

        // Reload reader to see the indexed documents
        engine.reload_reader().unwrap();

        let results = engine.search("Rust", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].card_id, "1");
    }

    #[test]
    fn test_search_performance() {
        let engine = SearchEngine::new_in_memory().unwrap();

        // Index 100 cards
        for i in 0..100 {
            engine
                .index_card(
                    &i.to_string(),
                    &format!("Card {}", i),
                    &format!("This is the content of card number {}", i),
                )
                .unwrap();
        }

        // Reload reader to see the indexed documents
        engine.reload_reader().unwrap();

        // Search should complete quickly
        let start = std::time::Instant::now();
        let results = engine.search("content", 10).unwrap();
        let elapsed = start.elapsed();

        assert!(results.len() > 0);
        assert!(elapsed.as_millis() < 100, "Search took too long: {:?}", elapsed);
    }
}
