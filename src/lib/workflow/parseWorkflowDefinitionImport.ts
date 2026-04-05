/**
 * Validates JSON imported as a workflow definition (Issue #462).
 * ワークフロー定義としてインポートする JSON を検証する（Issue #462）。
 */

import { newWorkflowId } from "./newWorkflowId";
import type { WorkflowStepDefinition } from "./types";

const MAX_STEPS = 50;
const MAX_FIELD_LEN = 50_000;
const MAX_TOOL_NAME_LEN = 64;

const INVALID = "invalid workflow JSON";

/**
 * Parses one step object from imported JSON.
 * インポート JSON のステップオブジェクトを 1 件パースする。
 */
function parseWorkflowStepImport(s: Record<string, unknown>): WorkflowStepDefinition {
  if (typeof s.title !== "string" || typeof s.instruction !== "string") {
    throw new Error(INVALID);
  }
  const title = s.title.slice(0, MAX_FIELD_LEN);
  const instruction = s.instruction.slice(0, MAX_FIELD_LEN);
  const id =
    typeof s.id === "string" && s.id.trim().length > 0 ? s.id.slice(0, 200) : newWorkflowId();

  const step: WorkflowStepDefinition = { id, title, instruction };

  if (s.maxTurns !== undefined) {
    if (typeof s.maxTurns !== "number" || !Number.isFinite(s.maxTurns)) {
      throw new Error(INVALID);
    }
    const mt = Math.floor(s.maxTurns);
    if (mt < 1 || mt > 500) {
      throw new Error(INVALID);
    }
    step.maxTurns = mt;
  }

  if (s.allowedTools !== undefined) {
    if (!Array.isArray(s.allowedTools)) {
      throw new Error(INVALID);
    }
    step.allowedTools = s.allowedTools.map((t) => {
      if (typeof t !== "string") {
        throw new Error(INVALID);
      }
      return t.slice(0, MAX_TOOL_NAME_LEN);
    });
  }

  return step;
}

/**
 * Parses and validates unknown JSON from file import.
 * ファイルインポート由来の不明な JSON をパースし検証する。
 *
 * @throws Error when the shape is invalid or limits are exceeded.
 */
export function parseWorkflowDefinitionImport(raw: unknown): {
  name: string;
  steps: WorkflowStepDefinition[];
} {
  if (!raw || typeof raw !== "object") {
    throw new Error(INVALID);
  }
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.slice(0, MAX_FIELD_LEN) : "";

  if (!Array.isArray(o.steps)) {
    throw new Error(INVALID);
  }
  if (o.steps.length === 0 || o.steps.length > MAX_STEPS) {
    throw new Error(INVALID);
  }

  const steps: WorkflowStepDefinition[] = [];
  for (const item of o.steps) {
    if (!item || typeof item !== "object") {
      throw new Error(INVALID);
    }
    steps.push(parseWorkflowStepImport(item as Record<string, unknown>));
  }

  return { name, steps };
}
