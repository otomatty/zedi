//! Workspace-relative directory listing for slash-command path completion.
//! スラッシュコマンドのパス補完用、ワークスペース相対ディレクトリ一覧。

use std::path::PathBuf;

/// Lists file and subdirectory names under `relative_dir` (relative to process cwd).
/// `relative_dir` が空なら cwd 直下を列挙する。
/// Directories are suffixed with `/`. Hidden names (leading `.`) are skipped.
///
/// 列挙先が cwd 外に出る場合はエラーにする（パストラバーサル対策）。
#[tauri::command]
pub fn list_workspace_directory_entries(relative_dir: String) -> Result<Vec<String>, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    let target = resolve_under_cwd(&cwd, &relative_dir)?;
    if !target.is_dir() {
        return Ok(vec![]);
    }
    let mut out: Vec<String> = Vec::new();
    for entry in std::fs::read_dir(&target).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let is_dir = entry.file_type().map_err(|e| e.to_string())?.is_dir();
        out.push(if is_dir {
            format!("{name}/")
        } else {
            name
        });
    }
    out.sort();
    Ok(out)
}

fn resolve_under_cwd(cwd: &PathBuf, relative_dir: &str) -> Result<PathBuf, String> {
    let trimmed = relative_dir.trim();
    if trimmed.is_empty() {
        return Ok(cwd.clone());
    }
    let mut acc = cwd.clone();
    for comp in std::path::Path::new(trimmed).components() {
        match comp {
            std::path::Component::Normal(c) => acc.push(c),
            std::path::Component::ParentDir => {
                acc.pop();
            }
            std::path::Component::CurDir => {}
            std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                return Err("invalid path".into());
            }
        }
    }
    if !acc.starts_with(cwd) {
        return Err("path outside workspace".into());
    }
    Ok(acc)
}
