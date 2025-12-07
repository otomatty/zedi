// Link detector module using Aho-Corasick for fast pattern matching
// Detects existing card titles within text in real-time (< 100ms)

use aho_corasick::{AhoCorasick, AhoCorasickBuilder, MatchKind};
use serde::{Deserialize, Serialize};
use std::sync::RwLock;

/// Represents a detected link suggestion
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LinkSuggestion {
    pub title: String,
    pub start: usize,
    pub end: usize,
}

/// Link detector for finding card title matches in text
pub struct LinkDetector {
    automaton: RwLock<Option<AhoCorasick>>,
    patterns: RwLock<Vec<String>>,
}

impl LinkDetector {
    /// Create a new empty link detector
    pub fn new() -> Self {
        Self {
            automaton: RwLock::new(None),
            patterns: RwLock::new(Vec::new()),
        }
    }

    /// Update patterns with new list of card titles
    pub fn update_patterns(&self, titles: Vec<String>) -> Result<(), String> {
        if titles.is_empty() {
            let mut automaton = self.automaton.write().map_err(|e| e.to_string())?;
            let mut patterns = self.patterns.write().map_err(|e| e.to_string())?;
            *automaton = None;
            *patterns = Vec::new();
            return Ok(());
        }

        // Build new automaton with leftmost-longest match
        let ac = AhoCorasickBuilder::new()
            .match_kind(MatchKind::LeftmostLongest)
            .build(&titles)
            .map_err(|e| format!("Failed to build automaton: {}", e))?;

        let mut automaton = self.automaton.write().map_err(|e| e.to_string())?;
        let mut patterns = self.patterns.write().map_err(|e| e.to_string())?;

        *automaton = Some(ac);
        *patterns = titles;

        Ok(())
    }

    /// Add a single pattern (card title)
    pub fn add_pattern(&self, title: String) -> Result<(), String> {
        let mut patterns = self.patterns.write().map_err(|e| e.to_string())?;

        if !patterns.contains(&title) {
            patterns.push(title);
            drop(patterns);

            // Rebuild automaton
            let patterns = self.patterns.read().map_err(|e| e.to_string())?;
            if !patterns.is_empty() {
                let ac = AhoCorasickBuilder::new()
                    .match_kind(MatchKind::LeftmostLongest)
                    .build(patterns.iter())
                    .map_err(|e| format!("Failed to build automaton: {}", e))?;

                let mut automaton = self.automaton.write().map_err(|e| e.to_string())?;
                *automaton = Some(ac);
            }
        }

        Ok(())
    }

    /// Remove a pattern (card title)
    pub fn remove_pattern(&self, title: &str) -> Result<(), String> {
        let mut patterns = self.patterns.write().map_err(|e| e.to_string())?;

        if let Some(pos) = patterns.iter().position(|t| t == title) {
            patterns.remove(pos);
            drop(patterns);

            // Rebuild automaton
            let patterns = self.patterns.read().map_err(|e| e.to_string())?;
            if patterns.is_empty() {
                let mut automaton = self.automaton.write().map_err(|e| e.to_string())?;
                *automaton = None;
            } else {
                let ac = AhoCorasickBuilder::new()
                    .match_kind(MatchKind::LeftmostLongest)
                    .build(patterns.iter())
                    .map_err(|e| format!("Failed to build automaton: {}", e))?;

                let mut automaton = self.automaton.write().map_err(|e| e.to_string())?;
                *automaton = Some(ac);
            }
        }

        Ok(())
    }

    /// Find all matches in the given text
    pub fn find_matches(&self, text: &str) -> Result<Vec<LinkSuggestion>, String> {
        let automaton = self.automaton.read().map_err(|e| e.to_string())?;
        let patterns = self.patterns.read().map_err(|e| e.to_string())?;

        let Some(ac) = automaton.as_ref() else {
            return Ok(Vec::new());
        };

        let mut suggestions = Vec::new();

        for mat in ac.find_iter(text) {
            let pattern_idx = mat.pattern().as_usize();
            if pattern_idx < patterns.len() {
                suggestions.push(LinkSuggestion {
                    title: patterns[pattern_idx].clone(),
                    start: mat.start(),
                    end: mat.end(),
                });
            }
        }

        Ok(suggestions)
    }

    /// Get current pattern count
    pub fn pattern_count(&self) -> usize {
        self.patterns.read().map(|p| p.len()).unwrap_or(0)
    }
}

impl Default for LinkDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_matches() {
        let detector = LinkDetector::new();
        detector
            .update_patterns(vec!["Rust".to_string(), "Programming".to_string()])
            .unwrap();

        let matches = detector
            .find_matches("I love Rust Programming!")
            .unwrap();

        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].title, "Rust");
        assert_eq!(matches[1].title, "Programming");
    }

    #[test]
    fn test_overlapping_matches() {
        let detector = LinkDetector::new();
        detector
            .update_patterns(vec!["Rust".to_string(), "Rust Programming".to_string()])
            .unwrap();

        let matches = detector
            .find_matches("Learn Rust Programming today")
            .unwrap();

        // Should match longest first (leftmost-longest)
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].title, "Rust Programming");
    }

    #[test]
    fn test_performance() {
        let detector = LinkDetector::new();

        // Create 1000 patterns
        let patterns: Vec<String> = (0..1000).map(|i| format!("Pattern{}", i)).collect();
        detector.update_patterns(patterns).unwrap();

        // Generate 10000 char text
        let text = "Pattern42 ".repeat(1000);

        let start = std::time::Instant::now();
        let matches = detector.find_matches(&text).unwrap();
        let elapsed = start.elapsed();

        assert!(matches.len() > 0);
        assert!(elapsed.as_millis() < 100, "Detection took too long: {:?}", elapsed);
    }
}
