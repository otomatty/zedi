//! Workspace-relative paths: process cwd (slash completion) and note-linked roots (Issue #461).
//! プロセス cwd 基準（スラッシュ補完）とノート紐付けルート（Issue #461）。

use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Maximum bytes returned by {@link read_note_workspace_file}.
/// {@link read_note_workspace_file} が返す最大バイト数。
const MAX_NOTE_WORKSPACE_FILE_BYTES: u64 = 512 * 1024;

/// Default cap for {@link list_note_workspace_entries}.
/// {@link list_note_workspace_entries} の既定上限。
const DEFAULT_NOTE_WORKSPACE_MAX_ENTRIES: u32 = 500;

/// Hard cap for list entries (API + UI abuse mitigation).
/// 列挙件数の上限（API 悪用緩和）。
const HARD_MAX_NOTE_WORKSPACE_ENTRIES: u32 = 2000;

/// Persisted mapping note id → canonical workspace root (desktop; Issue #461).
/// ノート ID → 正規化済みワークスペースルートの永続マップ（デスクトップ、Issue #461）。
#[derive(Debug, Default, Serialize, Deserialize)]
struct NoteWorkspaceRegistry {
    roots: HashMap<String, String>,
}

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

/// Re-canonicalize immediately before opening to narrow TOCTOU vs symlink swap (not full `openat` hardening).
/// オープン直前に再 canonicalize して TOCTOU を狭める（openat 相当の完全対策ではない）。
fn assert_still_under_root(root_canon: &PathBuf, path: &Path) -> Result<PathBuf, String> {
    let canon = path.canonicalize().map_err(|e| e.to_string())?;
    if !canon.starts_with(root_canon) {
        return Err("path outside workspace".into());
    }
    Ok(canon)
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

fn validate_note_id_key(note_id: &str) -> Result<(), String> {
    let t = note_id.trim();
    if t.is_empty() {
        return Err("invalid note id".into());
    }
    match t {
        "__proto__" | "prototype" | "constructor" => Err("invalid note id".into()),
        _ => Ok(()),
    }
}

fn registry_file() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "no data directory".to_string())?
        .join("zedi");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("note_workspace_roots.json"))
}

fn load_registry() -> Result<NoteWorkspaceRegistry, String> {
    let path = registry_file()?;
    if !path.exists() {
        return Ok(NoteWorkspaceRegistry::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_registry(reg: &NoteWorkspaceRegistry) -> Result<(), String> {
    let path = registry_file()?;
    let raw = serde_json::to_string_pretty(reg).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| e.to_string())
}

fn resolve_registered_root(note_id: &str) -> Result<PathBuf, String> {
    let reg = load_registry()?;
    let s = reg
        .roots
        .get(note_id)
        .ok_or_else(|| "note workspace not registered".to_string())?;
    canonical_note_workspace_root(s)
}

/// Registers the canonical workspace root for a note (used by read/list commands; do not trust raw paths from IPC alone).
/// ノートのワークスペースルートを登録する（読み取りはここ経由。IPC の生パスだけは信用しない）。
#[tauri::command]
pub fn register_note_workspace_root(note_id: String, workspace_root: String) -> Result<(), String> {
    validate_note_id_key(&note_id)?;
    let canon = canonical_note_workspace_root(&workspace_root)?;
    let mut reg = load_registry()?;
    reg.roots
        .insert(note_id, canon.to_string_lossy().to_string());
    save_registry(&reg)
}

/// Removes the registered workspace root for a note.
/// ノートの登録済みワークスペースルートを削除する。
#[tauri::command]
pub fn clear_note_workspace_root(note_id: String) -> Result<(), String> {
    validate_note_id_key(&note_id)?;
    let mut reg = load_registry()?;
    reg.roots.remove(&note_id);
    save_registry(&reg)
}

/// Reads UTF-8 under `root_canon` with a single file handle and a hard byte cap (no metadata/read split).
/// 単一ファイルハンドルでバイト上限を強制（metadata と read の分離によるレースを避ける）。
fn read_utf8_file_under_root(root_canon: &PathBuf, relative_path: &str) -> Result<String, String> {
    let target = resolve_under_root(root_canon, relative_path)?;
    if !target.exists() {
        return Err("not a file".into());
    }
    let target = assert_still_under_root(root_canon, target.as_path())?;
    if !target.is_file() {
        return Err("not a file".into());
    }
    let cap = MAX_NOTE_WORKSPACE_FILE_BYTES.saturating_add(1);
    let mut buf = Vec::new();
    File::open(&target)
        .map_err(|e| e.to_string())?
        .take(cap)
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;
    if buf.len() as u64 > MAX_NOTE_WORKSPACE_FILE_BYTES {
        return Err("file too large".into());
    }
    String::from_utf8(buf).map_err(|e| e.to_string())
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
    if !target.exists() {
        return Ok(vec![]);
    }
    let target = assert_still_under_root(&cwd_canon, target.as_path())?;
    if !target.is_dir() {
        return Ok(vec![]);
    }
    list_directory_names(&target, DEFAULT_NOTE_WORKSPACE_MAX_ENTRIES)
}

/// Reads a UTF-8 text file under the registered workspace for `note_id`; size-capped via one handle.
/// 登録済み `note_id` のワークスペース配下の UTF-8 を読む（単一ハンドルでサイズ上限）。
#[tauri::command]
pub fn read_note_workspace_file(note_id: String, relative_path: String) -> Result<String, String> {
    validate_note_id_key(&note_id)?;
    let root_canon = resolve_registered_root(&note_id)?;
    let rel = relative_path.replace('\\', "/");
    read_utf8_file_under_root(&root_canon, &rel)
}

/// Lists names in `relative_dir` under the registered workspace for `note_id`.
/// 登録済み `note_id` のワークスペース配下で `relative_dir` を列挙する。
#[tauri::command]
pub fn list_note_workspace_entries(
    note_id: String,
    relative_dir: String,
    max_entries: Option<u32>,
) -> Result<Vec<String>, String> {
    validate_note_id_key(&note_id)?;
    let cap = max_entries
        .unwrap_or(DEFAULT_NOTE_WORKSPACE_MAX_ENTRIES)
        .min(HARD_MAX_NOTE_WORKSPACE_ENTRIES);
    let root_canon = resolve_registered_root(&note_id)?;
    let rel = relative_dir.replace('\\', "/");
    let target = resolve_under_root(&root_canon, &rel)?;
    if !target.exists() {
        return Ok(vec![]);
    }
    let target = assert_still_under_root(&root_canon, target.as_path())?;
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
    fn read_utf8_file_under_root_reads_utf8() {
        let tmp = tempdir().unwrap();
        let sub = tmp.path().join("proj");
        fs::create_dir(&sub).unwrap();
        let f = sub.join("hello.txt");
        let mut file = fs::File::create(&f).unwrap();
        writeln!(file, "hi").unwrap();
        drop(file);

        let root = sub.canonicalize().unwrap();
        let text = read_utf8_file_under_root(&root, "hello.txt").unwrap();
        assert!(text.contains("hi"));
    }
}
