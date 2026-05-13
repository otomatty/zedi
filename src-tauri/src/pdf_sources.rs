//! Local PDF source registry and bytes provider (issue otomatty/zedi#389).
//!
//! ローカル PDF のレジストリとバイト返却（issue otomatty/zedi#389）。
//!
//! 設計 / Design:
//!   - 元 PDF の絶対パスは **このプロセス内** だけで保持する。サーバには絶対に送らない。
//!   - The absolute path of a PDF lives ONLY inside this process. Never sent to
//!     the server (otherwise the local-first promise breaks).
//!   - レジストリは `$DATA_DIR/zedi/pdf_sources.json` に atomic-write で永続化。
//!   - The registry file `$DATA_DIR/zedi/pdf_sources.json` is written atomically.
//!   - SHA-256 は最初の登録時のみ計算し、以降は `mtime+size` で高速一致判定する。
//!   - SHA-256 is computed once at register time; later opens use mtime+size as
//!     a fast-equivalence check.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// PDF レジストリの read-modify-write を直列化する。
/// Serialize read-modify-write on the PDF registry file (concurrent IPC).
static PDF_REGISTRY_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

fn pdf_registry_mutex() -> &'static Mutex<()> {
    PDF_REGISTRY_MUTEX.get_or_init(|| Mutex::new(()))
}

fn with_pdf_registry_lock<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce() -> Result<R, String>,
{
    let _guard = pdf_registry_mutex()
        .lock()
        .map_err(|e| format!("pdf registry mutex poisoned: {e}"))?;
    f()
}

/// 同一ディレクトリの一時ファイル + rename によるアトミック書き込み。
/// Atomic write via same-directory temp file + rename.
fn atomic_write_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let file_name = path
        .file_name()
        .ok_or_else(|| "pdf registry path has no file name".to_string())?;
    let mut tmp_name = file_name.to_os_string();
    tmp_name.push(".tmp");
    let parent = path
        .parent()
        .ok_or_else(|| "pdf registry path has no parent".to_string())?;
    let tmp_path = parent.join(tmp_name);
    fs::write(&tmp_path, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, path).map_err(|e| e.to_string())
}

/// PDF の最大バイトサイズ（IPC ペイロード制約 + メモリ保護）。
/// Maximum allowed PDF size — both an IPC payload cap and a memory guard.
const MAX_PDF_BYTES: u64 = 200 * 1024 * 1024; // 200 MiB

/// レジストリエントリ。`source_id` をキーとして使う。
/// Persisted entry keyed by `source_id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PdfRegistryEntry {
    absolute_path: String,
    last_seen_sha256: String,
    last_seen_size: u64,
    last_seen_mtime_ms: i128,
}

/// レジストリ全体の JSON 形（version で将来移行できるようにする）。
/// Top-level registry shape; carries a version for future migrations.
#[derive(Debug, Serialize, Deserialize)]
struct PdfRegistry {
    version: u32,
    sources: HashMap<String, PdfRegistryEntry>,
}

impl Default for PdfRegistry {
    fn default() -> Self {
        Self {
            version: 1,
            sources: HashMap::new(),
        }
    }
}

fn pdf_registry_file() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "no data directory".to_string())?
        .join("zedi");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("pdf_sources.json"))
}

fn load_pdf_registry() -> Result<PdfRegistry, String> {
    let path = pdf_registry_file()?;
    if !path.exists() {
        return Ok(PdfRegistry::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_pdf_registry(reg: &PdfRegistry) -> Result<(), String> {
    let path = pdf_registry_file()?;
    let raw = serde_json::to_string_pretty(reg).map_err(|e| e.to_string())?;
    atomic_write_file(&path, raw.as_bytes())
}

/// 予約キーの拒否 + 空文字拒否。
/// Reject reserved keys and empty strings.
fn parse_source_id(source_id: &str) -> Result<String, String> {
    let t = source_id.trim();
    if t.is_empty() {
        return Err("invalid source id".into());
    }
    match t {
        "__proto__" | "prototype" | "constructor" => Err("invalid source id".into()),
        _ => Ok(t.to_string()),
    }
}

/// PDF ファイルか / 通常ファイルか / サイズ上限内か を検証して canonical path を返す。
/// Validate the absolute path: regular file, `.pdf` extension, size cap.
fn validate_pdf_path(absolute_path: &str) -> Result<(PathBuf, u64), String> {
    let trimmed = absolute_path.trim();
    if trimmed.is_empty() {
        return Err("absolute path is empty".into());
    }
    let p = PathBuf::from(trimmed);
    let canon = p.canonicalize().map_err(|e| format!("canonicalize: {e}"))?;
    let meta = fs::metadata(&canon).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("not a regular file".into());
    }
    // OS のシンボリックリンクは canonicalize で剥がれるが、念のため file_type で確認。
    // canonicalize already follows symlinks; this is a defense-in-depth check.
    let ft = fs::symlink_metadata(&canon).map_err(|e| e.to_string())?.file_type();
    if ft.is_symlink() {
        return Err("symlinks are not allowed".into());
    }
    let ext = canon
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    if ext.as_deref() != Some("pdf") {
        return Err("not a .pdf file".into());
    }
    if meta.len() > MAX_PDF_BYTES {
        return Err(format!(
            "pdf exceeds size cap ({} bytes > {} bytes)",
            meta.len(),
            MAX_PDF_BYTES
        ));
    }
    Ok((canon, meta.len()))
}

/// 64KiB チャンクで SHA-256 を計算する。
/// Streaming SHA-256 over 64 KiB chunks.
fn sha256_file(path: &Path) -> Result<String, String> {
    let f = File::open(path).map_err(|e| e.to_string())?;
    let mut reader = BufReader::with_capacity(64 * 1024, f);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// ファイルの更新時刻（ms）と size を取得する。
/// Read file size and mtime in milliseconds since UNIX epoch.
fn file_size_and_mtime(path: &Path) -> Result<(u64, i128), String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let size = meta.len();
    let mtime = meta
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i128)
        .unwrap_or(0);
    Ok((size, mtime))
}

// ── Public command response types ───────────────────────────────────────────

/// `register_pdf_source` の戻り値。
/// Return shape for {@link register_pdf_source}.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredPdfSource {
    pub sha256: String,
    pub byte_size: u64,
    pub display_name: String,
}

/// `verify_pdf_source` の戻り値。
/// Return shape for {@link verify_pdf_source}.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfVerifyResult {
    pub exists: bool,
    pub size_changed: bool,
    pub mtime_changed: bool,
    pub absolute_path_known: bool,
}

// ── Tauri commands ──────────────────────────────────────────────────────────

/// ローカル PDF を「登録準備」する: パス検証 + SHA-256 計算 + 表示名取得。
/// この時点ではレジストリには書き込まない。サーバ側で `sourceId` が確定したら
/// `attach_pdf_source_path` を呼んでレジストリへ記録する。
///
/// "Register-prepare" a local PDF: validate the path, compute SHA-256, and
/// extract the display name. The registry is NOT yet updated. Once the server
/// returns the canonical `sourceId`, the client must call
/// {@link attach_pdf_source_path} to persist the mapping.
#[tauri::command]
pub fn register_pdf_source(absolute_path: String) -> Result<RegisteredPdfSource, String> {
    let (canon, byte_size) = validate_pdf_path(&absolute_path)?;
    let sha256 = sha256_file(&canon)?;
    let display_name = canon
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "untitled.pdf".to_string());
    Ok(RegisteredPdfSource {
        sha256,
        byte_size,
        display_name,
    })
}

/// `sourceId` ↔ 絶対パスをレジストリに紐づける（サーバ確定後に呼ぶ）。
/// Persist the `sourceId → absolutePath` mapping after the server has returned
/// the canonical source id from `/api/sources/pdf`.
#[tauri::command]
pub fn attach_pdf_source_path(
    source_id: String,
    absolute_path: String,
    sha256: String,
) -> Result<(), String> {
    let source_id = parse_source_id(&source_id)?;
    let (canon, _) = validate_pdf_path(&absolute_path)?;
    if !is_sha256_hex(&sha256) {
        return Err("sha256 must be 64-char hex".into());
    }
    let (size, mtime) = file_size_and_mtime(&canon)?;
    with_pdf_registry_lock(|| {
        let mut reg = load_pdf_registry()?;
        reg.sources.insert(
            source_id,
            PdfRegistryEntry {
                absolute_path: canon.to_string_lossy().to_string(),
                last_seen_sha256: sha256.to_ascii_lowercase(),
                last_seen_size: size,
                last_seen_mtime_ms: mtime,
            },
        );
        save_pdf_registry(&reg)
    })
}

/// 64 文字の hex か簡易判定（regex crate を入れずに）。
/// Inline check for a 64-char hex string (avoids pulling in `regex`).
fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit())
}

/// 登録済み PDF を `read_pdf_bytes` 等で開く前にチェックする。
/// 戻り値:
///   - `exists`: 実ファイルが残っているか
///   - `size_changed` / `mtime_changed`: 前回 attach 時から変化したか
///   - `absolute_path_known`: レジストリにエントリが残っているか
///
/// Used by the viewer to render the missing-file banner / file-changed warning.
#[tauri::command]
pub fn verify_pdf_source(source_id: String) -> Result<PdfVerifyResult, String> {
    let source_id = parse_source_id(&source_id)?;
    let reg = load_pdf_registry()?;
    let entry = match reg.sources.get(&source_id) {
        Some(e) => e.clone(),
        None => {
            return Ok(PdfVerifyResult {
                exists: false,
                size_changed: false,
                mtime_changed: false,
                absolute_path_known: false,
            });
        }
    };
    let path = PathBuf::from(&entry.absolute_path);
    let canon = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return Ok(PdfVerifyResult {
                exists: false,
                size_changed: false,
                mtime_changed: false,
                absolute_path_known: true,
            });
        }
    };
    let meta = match fs::metadata(&canon) {
        Ok(m) => m,
        Err(_) => {
            return Ok(PdfVerifyResult {
                exists: false,
                size_changed: false,
                mtime_changed: false,
                absolute_path_known: true,
            });
        }
    };
    let (size, mtime) = file_size_and_mtime(&canon).unwrap_or((meta.len(), 0));
    Ok(PdfVerifyResult {
        exists: true,
        size_changed: size != entry.last_seen_size,
        mtime_changed: mtime != entry.last_seen_mtime_ms,
        absolute_path_known: true,
    })
}

/// レジストリエントリを削除する（ファイルは触らない）。
/// Remove the registry entry only; the underlying file is left untouched.
#[tauri::command]
pub fn forget_pdf_source(source_id: String) -> Result<(), String> {
    let source_id = parse_source_id(&source_id)?;
    with_pdf_registry_lock(|| {
        let mut reg = load_pdf_registry()?;
        reg.sources.remove(&source_id);
        save_pdf_registry(&reg)
    })
}

/// 登録済み PDF のバイト列を返す。viewer は Uint8Array を pdf.js に渡す。
/// Return the bytes of a registered PDF. The viewer hands the Uint8Array to
/// pdf.js. Note: IPC encodes the Vec<u8> as a base64-ish payload which roughly
/// doubles memory; for v1 we cap at 200 MiB and revisit via a custom URI scheme
/// later if performance demands it.
#[tauri::command]
pub fn read_pdf_bytes(source_id: String) -> Result<Vec<u8>, String> {
    let source_id = parse_source_id(&source_id)?;
    let reg = load_pdf_registry()?;
    let entry = reg
        .sources
        .get(&source_id)
        .cloned()
        .ok_or_else(|| "pdf source not registered".to_string())?;
    let path = PathBuf::from(&entry.absolute_path);
    let canon = path.canonicalize().map_err(|e| format!("canonicalize: {e}"))?;
    // 拡張子 / 通常ファイル / サイズ上限 を再検証する（attach 後にファイルが置換された場合の保険）。
    // Re-validate so a swapped-out file post-attach cannot trick us.
    let (re_canon, byte_size) = validate_pdf_path(&canon.to_string_lossy())?;
    debug_assert_eq!(re_canon, canon);
    let mut bytes = Vec::with_capacity(byte_size as usize);
    File::open(&re_canon)
        .map_err(|e| e.to_string())?
        .take(MAX_PDF_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_PDF_BYTES {
        return Err("pdf exceeds size cap".into());
    }
    Ok(bytes)
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn write_temp_pdf(dir: &Path, name: &str, contents: &[u8]) -> PathBuf {
        let p = dir.join(name);
        let mut f = File::create(&p).unwrap();
        f.write_all(contents).unwrap();
        p
    }

    #[test]
    fn validate_pdf_path_rejects_non_pdf_extension() {
        let dir = TempDir::new().unwrap();
        let p = write_temp_pdf(dir.path(), "not-a-pdf.txt", b"hello");
        let err = validate_pdf_path(p.to_str().unwrap()).unwrap_err();
        assert!(err.contains("not a .pdf"), "got: {err}");
    }

    #[test]
    fn validate_pdf_path_accepts_a_pdf() {
        let dir = TempDir::new().unwrap();
        let p = write_temp_pdf(dir.path(), "ok.pdf", b"%PDF-1.4 fake");
        let (canon, size) = validate_pdf_path(p.to_str().unwrap()).unwrap();
        assert!(canon.to_string_lossy().ends_with("ok.pdf"));
        assert_eq!(size, 13);
    }

    #[test]
    fn validate_pdf_path_rejects_empty_path() {
        assert!(validate_pdf_path("").is_err());
        assert!(validate_pdf_path("    ").is_err());
    }

    #[test]
    fn sha256_file_is_stable() {
        let dir = TempDir::new().unwrap();
        let p = write_temp_pdf(dir.path(), "x.pdf", b"abc");
        let h = sha256_file(&p).unwrap();
        // sha256("abc") の既知値
        assert_eq!(
            h,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn parse_source_id_rejects_reserved_keys() {
        assert!(parse_source_id("__proto__").is_err());
        assert!(parse_source_id("").is_err());
        assert!(parse_source_id("ok").is_ok());
    }

    #[test]
    fn is_sha256_hex_validates_64_hex_chars() {
        assert!(is_sha256_hex(&"0".repeat(64)));
        assert!(is_sha256_hex(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        ));
        assert!(!is_sha256_hex("too-short"));
        assert!(!is_sha256_hex(&"z".repeat(64)));
    }
}
