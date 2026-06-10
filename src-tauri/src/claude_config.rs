//! Reads the local Claude config to import MCP server definitions (Issue: security hardening).
//! Only the `mcpServers` field is parsed and returned to the WebView so that the rest of
//! `~/.claude.json` — which can hold API keys, OAuth tokens, and project history — is never
//! exposed to frontend JavaScript. Replaces a broad `fs` capability grant over `$HOME/.claude/**`.
//!
//! ローカル Claude 設定から MCP サーバー定義を取り込む。`mcpServers` のみを解析して返し、
//! API キー・OAuth トークン・履歴を含みうる `~/.claude.json` 全体を WebView に渡さない。

use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

use serde_json::Value;

/// Cap the config read; real configs are tiny, this bounds a tampered/huge file.
/// 設定読み込みの上限。正常な設定は小さく、巨大ファイルによる悪用を防ぐ。
const MAX_CLAUDE_CONFIG_BYTES: u64 = 4 * 1024 * 1024;

/// Candidate config paths under the user's home directory, in priority order.
/// ホームディレクトリ配下の設定候補（優先順）。
fn candidate_paths() -> Vec<PathBuf> {
    match dirs::home_dir() {
        Some(home) => vec![
            home.join(".claude").join("claude_desktop_config.json"),
            home.join(".claude.json"),
        ],
        None => Vec::new(),
    }
}

/// Reads a JSON file (size-capped) and returns only its `mcpServers` object, if present.
/// JSON を読み（サイズ上限あり）、`mcpServers` オブジェクトのみを返す。
fn extract_mcp_servers(path: &PathBuf) -> Result<Option<Value>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut buf = String::new();
    file.take(MAX_CLAUDE_CONFIG_BYTES + 1)
        .read_to_string(&mut buf)
        .map_err(|e| e.to_string())?;
    if buf.len() as u64 > MAX_CLAUDE_CONFIG_BYTES {
        return Err("claude config is too large".to_string());
    }
    let value: Value = serde_json::from_str(&buf).map_err(|e| e.to_string())?;
    match value.get("mcpServers") {
        Some(servers) if servers.is_object() => Ok(Some(servers.clone())),
        _ => Ok(None),
    }
}

/// Returns the `mcpServers` map from the user's local Claude config, or `null` if none is found.
/// Frontend never receives any other field of the config file.
/// ローカル Claude 設定の `mcpServers` を返す。見つからなければ `null`。他フィールドは返さない。
#[tauri::command]
pub fn read_claude_mcp_servers() -> Result<Option<Value>, String> {
    for path in candidate_paths() {
        if !path.exists() {
            continue;
        }
        // A malformed/oversized first file should not silently fall through to the next; surface it.
        // 不正・過大な先頭ファイルを黙って次へ流さず、エラーを返す。
        return extract_mcp_servers(&path);
    }
    Ok(None)
}
