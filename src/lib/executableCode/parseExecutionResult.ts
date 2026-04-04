/**
 * Parses Claude's plain-text execution result (ZEDI markers).
 * Claude のプレーンテキスト実行結果（ZEDI マーカー）をパースする。
 */

/** Parsed stdout/stderr/exit from model output. / モデル出力から取り出した stdout / stderr / exit。 */
export interface ParsedZediExecution {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const STDOUT = "---ZEDI_STDOUT---";
const STDERR = "---ZEDI_STDERR---";
const EXIT = "---ZEDI_EXIT---";

/**
 * Extracts sections between ZEDI markers. Missing parts default to empty / 0.
 * ZEDI マーカー間のセクションを取り出す。欠損時は空 / 0。
 */
export function parseZediExecutionMarkers(text: string): ParsedZediExecution | null {
  const iOut = text.indexOf(STDOUT);
  const iErr = text.indexOf(STDERR);
  const iExit = text.indexOf(EXIT);
  if (iOut === -1 || iErr === -1 || iExit === -1) return null;

  const afterOut = iOut + STDOUT.length;
  const afterErr = iErr + STDERR.length;
  const afterExit = iExit + EXIT.length;

  const stdout = text.slice(afterOut, iErr).trim();
  const stderr = text.slice(afterErr, iExit).trim();
  const exitRaw = text.slice(afterExit).trim();
  const firstLine = exitRaw.split(/\r?\n/)[0]?.trim() ?? "";
  const parsed = parseInt(firstLine, 10);
  const exitCode = Number.isFinite(parsed) ? parsed : 0;

  return { stdout, stderr, exitCode };
}

/**
 * Parses model output; falls back to treating the whole string as stdout when markers are absent.
 * モデル出力をパースする。マーカーが無い場合は全文を stdout とみなすフォールバック。
 */
export function parseExecutionModelOutput(text: string): ParsedZediExecution {
  const trimmed = text.trim();
  const parsed = parseZediExecutionMarkers(trimmed);
  if (parsed) return parsed;
  return { stdout: trimmed, stderr: "", exitCode: 0 };
}
