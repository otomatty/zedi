/**
 * Claude Code sidecar entry: JSONL on stdin/stdout for the Tauri host process.
 * Tauri ホスト向け stdin/stdout JSONL の Claude Code sidecar エントリ。
 *
 * @packageDocumentation
 */

import * as readline from "node:readline";
import { formatResponseLine, parseRequestLine } from "./protocol";
import { checkClaudeInstallation } from "./handlers/installation";
import { runQuery } from "./handlers/query";
import { QueryActivityTracker } from "./handlers/status";

const tracker = new QueryActivityTracker();
const abortById = new Map<string, AbortController>();

function writeLine(line: string): void {
  process.stdout.write(line);
}

function emitError(id: string, error: string, code?: string): void {
  writeLine(formatResponseLine({ type: "error", id, error, code }));
}

async function handleRequest(raw: string): Promise<void> {
  let req;
  try {
    req = parseRequestLine(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    emitError("protocol", message, "parse_error");
    return;
  }

  switch (req.type) {
    case "shutdown": {
      tracker.abortAll();
      writeLine(formatResponseLine({ type: "shutdown-ack" }));
      process.exit(0);
      return;
    }
    case "status": {
      const snap = tracker.snapshot();
      writeLine(
        formatResponseLine({
          type: "status-response",
          correlationId: req.correlationId,
          status: snap.status,
          activeQueryIds: snap.activeQueryIds,
        }),
      );
      return;
    }
    case "check_installation": {
      const inst = await checkClaudeInstallation();
      writeLine(
        formatResponseLine({
          type: "installation-status",
          correlationId: req.correlationId,
          installed: inst.installed,
          version: inst.version,
        }),
      );
      return;
    }
    case "abort": {
      abortById.get(req.id)?.abort();
      return;
    }
    case "query": {
      const ac = new AbortController();
      abortById.set(req.id, ac);
      void runQuery({
        id: req.id,
        prompt: req.prompt,
        cwd: req.cwd,
        maxTurns: req.maxTurns,
        allowedTools: req.allowedTools,
        resume: req.resume,
        writeLine,
        abortController: ac,
        tracker,
      }).finally(() => {
        abortById.delete(req.id);
      });
      return;
    }
    default: {
      emitError("protocol", "unknown request type", "unknown_type");
    }
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  void handleRequest(line);
});

rl.on("close", () => {
  process.exit(0);
});
