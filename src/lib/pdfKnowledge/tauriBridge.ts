/**
 * Tauri 側 `pdf_sources.rs` への型付きブリッジ。
 *
 * Typed wrappers around the Tauri `#[tauri::command]` entries defined in
 * `src-tauri/src/pdf_sources.rs`. Web (non-Tauri) callers will receive a
 * {@link PdfKnowledgeUnsupportedError} so the UI can render the
 * desktop-only placeholder instead of silently failing.
 *
 * Phase 1 では PDF 関連機能は Tauri デスクトップ専用。Web からの呼び出しは
 * {@link PdfKnowledgeUnsupportedError} を throw する。
 */
import { isTauriDesktop } from "@/lib/platform";

/**
 * Web / 非 Tauri 環境で PDF 関連コマンドを呼んだときに throw されるエラー。
 * Thrown when a PDF command is invoked outside a Tauri desktop runtime.
 */
export class PdfKnowledgeUnsupportedError extends Error {
  /** Build the error with the canonical Phase-1 message. */
  constructor() {
    super("PDF knowledge ingestion is only available on Tauri desktop in Phase 1");
    this.name = "PdfKnowledgeUnsupportedError";
  }
}

/**
 * `register_pdf_source` の戻り値。Rust 側は camelCase serde で吐く。
 * Return shape of `register_pdf_source`; Rust uses camelCase via serde.
 */
export interface RegisteredPdfSource {
  sha256: string;
  byteSize: number;
  displayName: string;
}

/**
 * `verify_pdf_source` の戻り値。
 * Return shape of `verify_pdf_source`.
 */
export interface PdfVerifyResult {
  exists: boolean;
  sizeChanged: boolean;
  mtimeChanged: boolean;
  absolutePathKnown: boolean;
}

/**
 * `@tauri-apps/api/core` の `invoke` を動的 import で呼ぶ。
 * Dynamically import `invoke` so the web bundle doesn't fail when the Tauri
 * runtime is absent.
 */
async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriDesktop()) {
    throw new PdfKnowledgeUnsupportedError();
  }
  // 動的 import で web ビルドからは外す（Tauri runtime 側でのみ解決される）。
  // Dynamic import so the web build does not require @tauri-apps/api at all.
  const mod = (await import("@tauri-apps/api/core")) as {
    invoke: <R>(cmd: string, args?: Record<string, unknown>) => Promise<R>;
  };
  return mod.invoke<T>(command, args);
}

/**
 * ファイルダイアログ等で取得した絶対パスを「登録準備」する: SHA-256 と表示名を返す。
 * Validates the path, computes SHA-256, and returns display name.
 * Does NOT update the Tauri-side registry — call {@link attachPdfSourcePath} after
 * the server has returned the canonical `sourceId`.
 */
export function registerPdfSource(absolutePath: string): Promise<RegisteredPdfSource> {
  return tauriInvoke<RegisteredPdfSource>("register_pdf_source", { absolutePath });
}

/**
 * サーバから受け取った `sourceId` とローカル絶対パスを Tauri レジストリに紐づける。
 * Persist the `sourceId ↔ absolutePath` mapping in the Tauri-side registry.
 */
export async function attachPdfSourcePath(params: {
  sourceId: string;
  absolutePath: string;
  sha256: string;
}): Promise<void> {
  await tauriInvoke<null>("attach_pdf_source_path", {
    sourceId: params.sourceId,
    absolutePath: params.absolutePath,
    sha256: params.sha256,
  });
}

/**
 * ファイル欠損 / 変更検知。ビューア起動直後に呼ぶ。
 * Probe the registered file before opening the viewer.
 */
export function verifyPdfSource(sourceId: string): Promise<PdfVerifyResult> {
  return tauriInvoke<PdfVerifyResult>("verify_pdf_source", { sourceId });
}

/**
 * レジストリエントリを削除（実ファイルは触らない）。
 * Forget the registry entry; the underlying file is untouched.
 */
export async function forgetPdfSource(sourceId: string): Promise<void> {
  await tauriInvoke<null>("forget_pdf_source", { sourceId });
}

/**
 * 登録済み PDF のバイト列を取得する。pdf.js へ Uint8Array として渡す前提。
 * Returns the raw bytes of the registered PDF, ready to be fed to pdf.js.
 *
 * Tauri v2 の IPC は `Vec<u8>` を数値配列 / バイナリで返す。型のゆるさを吸収するため
 * Uint8Array に正規化して返す。
 * Tauri v2 IPC may surface the Rust `Vec<u8>` as either an array of numbers or
 * an ArrayBuffer; normalize to `Uint8Array` for the caller.
 */
export async function readPdfBytes(sourceId: string): Promise<Uint8Array> {
  const raw = await tauriInvoke<unknown>("read_pdf_bytes", { sourceId });
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Array.isArray(raw)) return Uint8Array.from(raw as number[]);
  throw new Error("read_pdf_bytes returned an unexpected shape");
}
