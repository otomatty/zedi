//! Claude Code sidecar: spawns the JSONL bridge process and exposes Tauri commands + events.
//! Claude Code sidecar — JSONL ブリッジプロセスを起動し Tauri コマンド・イベントを提供する。
//!
//! Events: `claude-stream-chunk`, `claude-stream-complete`, `claude-error`

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::{oneshot, Mutex as TokioMutex};

/// Shared state for the sidecar child stdin and RPC correlation.
/// sidecar の子プロセス stdin と相関 ID 用の共有状態。
#[derive(Debug)]
pub struct ClaudeSidecarState {
    repo_root: PathBuf,
    child: Arc<TokioMutex<Option<CommandChild>>>,
    pending: Arc<TokioMutex<HashMap<String, oneshot::Sender<Value>>>>,
}

impl ClaudeSidecarState {
    /// Builds state using the workspace root (parent of `src-tauri`).
    /// ワークスペースルート（`src-tauri` の親）で状態を構築する。
    pub fn new() -> Self {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        Self {
            repo_root,
            child: Arc::new(TokioMutex::new(None)),
            pending: Arc::new(TokioMutex::new(HashMap::new())),
        }
    }
}

impl Default for ClaudeSidecarState {
    fn default() -> Self {
        Self::new()
    }
}

fn map_shell_err(e: tauri_plugin_shell::Error) -> String {
    e.to_string()
}

async fn process_sidecar_line(
    app: &AppHandle,
    pending: &Arc<TokioMutex<HashMap<String, oneshot::Sender<Value>>>>,
    line: &str,
) {
    let value: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("claude-sidecar: stdout JSON parse error: {e}: {line}");
            return;
        }
    };

    let Some(typ) = value.get("type").and_then(|t| t.as_str()) else {
        return;
    };

    match typ {
        "stream-chunk" => {
            let _ = app.emit("claude-stream-chunk", &value);
        }
        "stream-complete" => {
            let _ = app.emit("claude-stream-complete", &value);
        }
        "error" => {
            let _ = app.emit("claude-error", &value);
        }
        "status-response" | "installation-status" => {
            if let Some(cid) = value.get("correlationId").and_then(|c| c.as_str()) {
                let mut guard = pending.lock().await;
                if let Some(tx) = guard.remove(cid) {
                    let _ = tx.send(value);
                }
            }
        }
        _ => {}
    }
}

async fn ensure_sidecar(app: &AppHandle, state: &ClaudeSidecarState) -> Result<(), String> {
    let mut slot = state.child.lock().await;
    if slot.is_some() {
        return Ok(());
    }

    let (mut rx, child) = if cfg!(debug_assertions) {
        app.shell()
            .command("bun")
            .args(["packages/claude-sidecar/src/index.ts"])
            .current_dir(&state.repo_root)
            .spawn()
            .map_err(map_shell_err)?
    } else {
        app.shell()
            .sidecar("binaries/claude-sidecar")
            .map_err(map_shell_err)?
            .spawn()
            .map_err(map_shell_err)?
    };

    let app_handle = app.clone();
    let pending = state.pending.clone();
    let child_slot = state.child.clone();

    tauri::async_runtime::spawn(async move {
        let mut line_buf = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    line_buf.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(pos) = line_buf.find('\n') {
                        let line = line_buf[..pos].trim().to_string();
                        line_buf.drain(..=pos);
                        if !line.is_empty() {
                            process_sidecar_line(&app_handle, &pending, &line).await;
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    eprintln!("claude-sidecar stderr: {}", String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Error(e) => {
                    eprintln!("claude-sidecar command error: {e}");
                    let _ = app_handle.emit(
                        "claude-error",
                        serde_json::json!({
                            "id": "sidecar",
                            "error": e,
                            "code": "sidecar_io_error"
                        }),
                    );
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("claude-sidecar terminated: {payload:?}");
                    *child_slot.lock().await = None;
                    let _ = app_handle.emit(
                        "claude-error",
                        serde_json::json!({
                            "id": "sidecar",
                            "error": "Claude sidecar process terminated",
                            "code": "sidecar_terminated",
                            "exitCode": payload.code,
                            "signal": payload.signal,
                        }),
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    *slot = Some(child);
    Ok(())
}

async fn write_line(state: &ClaudeSidecarState, line: &str) -> Result<(), String> {
    let mut guard = state.child.lock().await;
    let child = guard
        .as_mut()
        .ok_or_else(|| "Claude sidecar is not running".to_string())?;
    let bytes = format!("{}\n", line.trim_end());
    child
        .write(bytes.as_bytes())
        .map_err(|e| format!("failed to write sidecar stdin: {e}"))?;
    Ok(())
}

async fn rpc_json(
    _app: &AppHandle,
    state: &ClaudeSidecarState,
    request: Value,
    correlation_id: &str,
) -> Result<Value, String> {
    let (tx, rx) = oneshot::channel();
    {
        let mut p = state.pending.lock().await;
        p.insert(correlation_id.to_string(), tx);
    }

    let line = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    if let Err(e) = write_line(state, &line).await {
        state.pending.lock().await.remove(correlation_id);
        return Err(e);
    }

    let out = tokio::time::timeout(Duration::from_secs(30), rx).await;
    if out.is_err() {
        state.pending.lock().await.remove(correlation_id);
        return Err("sidecar RPC timed out".to_string());
    }

    out.unwrap()
        .map_err(|_| "sidecar RPC channel closed".to_string())
}

/// Sends a prompt to Claude Code via the sidecar; returns the request id for event correlation.
/// sidecar 経由でプロンプトを送り、イベント相関用のリクエスト ID を返す。
#[tauri::command]
pub async fn claude_query(
    app: AppHandle,
    state: State<'_, ClaudeSidecarState>,
    prompt: String,
    cwd: Option<String>,
    max_turns: Option<u32>,
    allowed_tools: Option<Vec<String>>,
    resume: Option<String>,
) -> Result<String, String> {
    ensure_sidecar(&app, &state).await?;

    let id = uuid::Uuid::new_v4().to_string();
    let mut req = serde_json::json!({
        "type": "query",
        "id": id,
        "prompt": prompt,
    });
    if let Some(c) = cwd {
        req["cwd"] = Value::String(c);
    }
    if let Some(m) = max_turns {
        req["maxTurns"] = Value::Number(m.into());
    }
    if let Some(tools) = allowed_tools {
        req["allowedTools"] = serde_json::to_value(tools).map_err(|e| e.to_string())?;
    }
    if let Some(r) = resume {
        req["resume"] = Value::String(r);
    }

    let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    write_line(&state, &line).await?;
    Ok(id)
}

/// Aborts a running query by id.
/// 実行中のクエリを ID で中断する。
#[tauri::command]
pub async fn claude_abort(
    app: AppHandle,
    state: State<'_, ClaudeSidecarState>,
    request_id: String,
) -> Result<(), String> {
    ensure_sidecar(&app, &state).await?;
    let req = serde_json::json!({
        "type": "abort",
        "id": request_id,
    });
    let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    write_line(&state, &line).await
}

/// Returns sidecar processing status (idle / active query ids).
/// sidecar の処理状態（アイドル / アクティブなクエリ ID）を返す。
#[tauri::command]
pub async fn claude_status(
    app: AppHandle,
    state: State<'_, ClaudeSidecarState>,
) -> Result<Value, String> {
    ensure_sidecar(&app, &state).await?;

    let correlation_id = uuid::Uuid::new_v4().to_string();
    let req = serde_json::json!({
        "type": "status",
        "correlationId": correlation_id,
    });

    rpc_json(&app, &state, req, &correlation_id).await
}

/// Checks whether the Claude Code CLI is installed (`claude --version`).
/// Claude Code CLI がインストールされているか（`claude --version`）を確認する。
#[tauri::command]
pub async fn check_claude_installation(
    app: AppHandle,
    state: State<'_, ClaudeSidecarState>,
) -> Result<Value, String> {
    ensure_sidecar(&app, &state).await?;

    let correlation_id = uuid::Uuid::new_v4().to_string();
    let req = serde_json::json!({
        "type": "check_installation",
        "correlationId": correlation_id,
    });

    rpc_json(&app, &state, req, &correlation_id).await
}
