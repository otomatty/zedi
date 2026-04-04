//! Workspace-relative paths: process cwd (slash completion) and note-linked roots (Issue #461).
//! プロセス cwd 基準（スラッシュ補完）とノート紐付けルート（Issue #461）。

use std::fs;
use std::path::{Component, Path, PathBuf};

/// Maximum bytes returned by {@link read_note_workspace_file}.
/// {@link read_note_workspace_file} が返す最大バイト数。
const MAX_NOTE_WORKSPACE_FILE_BYTES: u64 = 512 * 1024;

/// Default cap for {@link list_note_workspace_entries}.
/// {@link list_note_workspace_entries} の既定上限。
const DEFAULT_NOTE_WORKSPACE_MAX_ENTRIES: u32 = 500;

/// Hard cap for list entries (API + UI abuse mitigation).
/// 列挙件数の上限（API 悪用緩和）。
const HARD_MAX_NOTE_WORKSPACE_ENTRIES: u32 = 2000;

/// Resolves `relative` under an already-canonicalized root (traversal-safe).
/// Lexical joins first, then `canonicalize` on the resolved path or the longest existing prefix.
/// 正規化済みルート配下に解決。字句結合後に終端または最長の存在接頭辞を `canonicalize`。
pub(crate) fn resolve_under_root(root_canon: &PathBuf, relative: &str) -> Result<PathBuf, String> {
    let trimmed = relative.trim();
    if trimmed.is_empty() {
        return Ok(root_canon.clone());
    }
    let mut acc = root_canon.clone();
    for comp in Path::new(trimmed).components() {
        match comp {
            Component::Normal(c) => acc.push(c),
            Component::ParentDir => {
                acc.pop();
                if !acc.starts_with(root_canon) {
                    return Err("path outside workspace".into());
                }
            }
            Component::CurDir => {}
            Component::RootDir | Component::Prefix(_) => {
                return Err("invalid path".into());
            }
        }
    }
    if acc.exists() {
        let canon = acc.canonicalize().map_err(|e| e.to_string())?;
        if !canon.starts_with(root_canon) {
            return Err("path outside workspace".into());
        }
        return Ok(canon);
    }
    // Non-existent leaf: walk up to the longest existing prefix so symlink escapes are still detected.
    let mut check = acc.clone();
    loop {
        if check.exists() {
            let canon = check.canonicalize().map_err(|e| e.to_string())?;
            if !canon.starts_with(root_canon) {
                return Err("path outside workspace".into());
            }
            break;
        }
        if check == *root_canon {
            break;
        }
        if !check.pop() {
            break;
        }
    }
    if !acc.starts_with(root_canon) {
        return Err("path outside workspace".into());
    }
    Ok(acc)
}

fn canonical_note_workspace_root(workspace_root: &str) -> Result<PathBuf, String> {
    let trimmed = workspace_root.trim();
    if trimmed.is_empty() {
        return Err("empty workspace root".into());
    }
    let p = PathBuf::from(trimmed);
    let canon = p.canonicalize().map_err(|e| e.to_string())?;
    if !canon.is_dir() {
        return Err("workspace root is not a directory".into());
    }
    Ok(canon)
}

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
    let target = resolve_under_root(&cwd_canon, &relative_dir)?;
    if !target.is_dir() {
        return Ok(vec![]);
    }
    list_directory_names(&target, DEFAULT_NOTE_WORKSPACE_MAX_ENTRIES)
}

/// Reads a UTF-8 text file under `workspace_root` (canonicalized); size-capped.
/// `workspace_root` 配下の UTF-8 テキストを読む（サイズ上限あり）。
#[tauri::command]
pub fn read_note_workspace_file(workspace_root: String, relative_path: String) -> Result<String, String> {
    let root_canon = canonical_note_workspace_root(&workspace_root)?;
    let target = resolve_under_root(&root_canon, &relative_path)?;
    if !target.is_file() {
        return Err("not a file".into());
    }
    let meta = fs::metadata(&target).map_err(|e| e.to_string())?;
    if meta.len() > MAX_NOTE_WORKSPACE_FILE_BYTES {
        return Err("file too large".into());
    }
    fs::read_to_string(&target).map_err(|e| e.to_string())
}

/// Lists names in `relative_dir` under `workspace_root` (same shape as {@link list_workspace_directory_entries}).
/// {@link list_workspace_directory_entries} と同じ形で `workspace_root` 配下を列挙する。
#[tauri::command]
pub fn list_note_workspace_entries(
    workspace_root: String,
    relative_dir: String,
    max_entries: Option<u32>,
) -> Result<Vec<String>, String> {
    let cap = max_entries
        .unwrap_or(DEFAULT_NOTE_WORKSPACE_MAX_ENTRIES)
        .min(HARD_MAX_NOTE_WORKSPACE_ENTRIES);
    let root_canon = canonical_note_workspace_root(&workspace_root)?;
    let target = resolve_under_root(&root_canon, &relative_dir)?;
    if !target.is_dir() {
        return Ok(vec![]);
    }
    list_directory_names(&target, cap)
}

fn list_directory_names(target: &Path, max_entries: u32) -> Result<Vec<String>, String> {
    let mut out: Vec<String> = Vec::new();
    for entry in fs::read_dir(target).map_err(|e| e.to_string())? {
        if out.len() >= max_entries as usize {
            break;
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn resolve_under_root_rejects_parent_escape() {
        let tmp = tempdir().unwrap();
        let root = tmp.path().canonicalize().unwrap();
        let err = resolve_under_root(&root, "..").unwrap_err();
        assert!(err.contains("outside") || err.contains("workspace"));
    }

    #[test]
    fn read_note_workspace_file_reads_utf8() {
        let tmp = tempdir().unwrap();
        let sub = tmp.path().join("proj");
        fs::create_dir(&sub).unwrap();
        let f = sub.join("hello.txt");
        let mut file = fs::File::create(&f).unwrap();
        writeln!(file, "hi").unwrap();
        drop(file);

        let root = sub.canonicalize().unwrap();
        let text = read_note_workspace_file(
            root.to_string_lossy().to_string(),
            "hello.txt".to_string(),
        )
        .unwrap();
        assert!(text.contains("hi"));
    }
}
