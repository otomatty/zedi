//! Workspace-relative directory listing for slash-command path completion.
//! スラッシュコマンドのパス補完用、ワークスペース相対ディレクトリ一覧。

use std::path::PathBuf;

/// Lists file and subdirectory names under `relative_dir` (relative to process cwd).
/// `relative_dir` が空なら cwd 直下を列挙する。
/// Directories are suffixed with `/`. Hidden names (leading `.`) are skipped.
///
/// 列挙先が cwd 外に出る場合はエラーにする（パストラバーサル対策）。
/// 存在するパスは `canonicalize` してシンボリックリンク越しのエスケープを検出する。
#[tauri::command]
pub fn list_workspace_directory_entries(relative_dir: String) -> Result<Vec<String>, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    let cwd_canon = cwd.canonicalize().map_err(|e| e.to_string())?;
    let target = resolve_under_cwd(&cwd_canon, &relative_dir)?;
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

fn resolve_under_cwd(cwd_canon: &PathBuf, relative_dir: &str) -> Result<PathBuf, String> {
    let trimmed = relative_dir.trim();
    if trimmed.is_empty() {
        return Ok(cwd_canon.clone());
    }
    let mut acc = cwd_canon.clone();
    for comp in std::path::Path::new(trimmed).components() {
        match comp {
            std::path::Component::Normal(c) => {
                acc.push(c);
                if acc.exists() {
                    let canon = acc.canonicalize().map_err(|e| e.to_string())?;
                    if !canon.starts_with(cwd_canon) {
                        return Err("path outside workspace".into());
                    }
                    acc = canon;
                }
            }
            std::path::Component::ParentDir => {
                acc.pop();
                if !acc.starts_with(cwd_canon) {
                    return Err("path outside workspace".into());
                }
            }
            std::path::Component::CurDir => {}
            std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                return Err("invalid path".into());
            }
        }
    }
    if acc.exists() {
        let canon = acc.canonicalize().map_err(|e| e.to_string())?;
        if !canon.starts_with(cwd_canon) {
            return Err("path outside workspace".into());
        }
        return Ok(canon);
    }
    if !acc.starts_with(cwd_canon) {
        return Err("path outside workspace".into());
    }
    Ok(acc)
}
