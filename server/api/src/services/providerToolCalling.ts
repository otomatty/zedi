/**
 * Provider tool-calling helpers for `aiProviders` non-streaming paths.
 *
 * LangChain passes OpenAI-shaped `{ type: "function", function: ... }` tools via
 * `ZediChatModel.bindTools`. These helpers normalize that shape into each vendor
 * API payload and map responses back to {@link ZediToolCall}.
 */
import { randomUUID } from "node:crypto";
import type { ZediChatTool, ZediToolCall, ZediToolChoice } from "../types/index.js";

/** Normalized function declaration shared by request builders. */
export interface NormalizedFunctionTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Normalize LangChain/OpenAI-style tools into a provider-agnostic list.
 *
 * @param tools - Tools from `AIChatOptions.tools`.
 */
export function normalizeFunctionTools(
  tools: ZediChatTool[] | undefined,
): NormalizedFunctionTool[] {
  if (!tools?.length) return [];
  const normalized: NormalizedFunctionTool[] = [];
  for (const tool of tools) {
    if (tool.type !== "function" || !tool.function?.name) continue;
    normalized.push({
      name: tool.function.name,
      description: tool.function.description ?? "",
      parameters: tool.function.parameters ?? { type: "object", properties: {} },
    });
  }
  return normalized;
}

/**
 * Build OpenAI Chat Completions `tools` / `tool_choice` fields.
 *
 * @param tools - Normalized function tools.
 * @param toolChoice - Optional tool-choice hint.
 */
export function buildOpenAiToolRequest(
  tools: NormalizedFunctionTool[],
  toolChoice?: ZediToolChoice,
): Record<string, unknown> {
  if (tools.length === 0) return {};
  const payload: Record<string, unknown> = {
    tools: tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
  };
  if (toolChoice !== undefined) {
    payload.tool_choice = toolChoice;
  }
  return payload;
}

/**
 * Parse OpenAI Chat Completions tool calls from a response message.
 *
 * @param message - `choices[0].message` object from OpenAI.
 */
export function parseOpenAiToolCalls(message: {
  tool_calls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}): ZediToolCall[] {
  const calls = message.tool_calls ?? [];
  const parsed: ZediToolCall[] = [];
  for (const call of calls) {
    const name = call.function?.name;
    if (!name) continue;
    const rawArgs = call.function?.arguments ?? "{}";
    let args: Record<string, unknown> = {};
    try {
      const value = JSON.parse(rawArgs) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        args = value as Record<string, unknown>;
      }
    } catch {
      args = {};
    }
    parsed.push({
      id: call.id ?? randomUUID(),
      name,
      args,
    });
  }
  return parsed;
}

/**
 * Build Anthropic Messages API `tools` / `tool_choice` fields.
 *
 * @param tools - Normalized function tools.
 * @param toolChoice - Optional tool-choice hint.
 */
export function buildAnthropicToolRequest(
  tools: NormalizedFunctionTool[],
  toolChoice?: ZediToolChoice,
): Record<string, unknown> {
  if (tools.length === 0) return {};
  const payload: Record<string, unknown> = {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    })),
  };
  if (toolChoice === "none") {
    payload.tool_choice = { type: "none" };
  } else if (toolChoice === "required" || toolChoice === "auto") {
    payload.tool_choice = { type: "any" };
  } else if (typeof toolChoice === "object" && toolChoice.type === "function") {
    payload.tool_choice = { type: "tool", name: toolChoice.function.name };
  }
  return payload;
}

/**
 * Parse Anthropic tool-use blocks from a Messages API response.
 *
 * @param content - `content` array from Anthropic.
 */
export function parseAnthropicToolCalls(
  content: Array<{ type?: string; id?: string; name?: string; input?: Record<string, unknown> }>,
): ZediToolCall[] {
  const parsed: ZediToolCall[] = [];
  for (const block of content) {
    if (block.type !== "tool_use" || !block.name) continue;
    parsed.push({
      id: block.id ?? randomUUID(),
      name: block.name,
      args: block.input ?? {},
    });
  }
  return parsed;
}

/**
 * Build Gemini `generateContent` tool fields.
 *
 * @param tools - Normalized function tools.
 * @param toolChoice - Optional tool-choice hint.
 */
export function buildGoogleToolRequest(
  tools: NormalizedFunctionTool[],
  toolChoice?: ZediToolChoice,
): Record<string, unknown> {
  if (tools.length === 0) return {};
  const payload: Record<string, unknown> = {
    tools: [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    ],
  };
  if (typeof toolChoice === "object" && toolChoice.type === "function") {
    payload.toolConfig = {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [toolChoice.function.name],
      },
    };
  } else if (toolChoice === "required") {
    payload.toolConfig = {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: tools.map((tool) => tool.name),
      },
    };
  }
  return payload;
}

/**
 * Parse Gemini function-call parts from a candidate content payload.
 *
 * @param parts - `candidates[0].content.parts` from Gemini.
 */
export function parseGoogleToolCalls(
  parts: Array<{ text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }>,
): ZediToolCall[] {
  const parsed: ZediToolCall[] = [];
  for (const part of parts) {
    const fn = part.functionCall;
    if (!fn?.name) continue;
    parsed.push({
      id: randomUUID(),
      name: fn.name,
      args: fn.args ?? {},
    });
  }
  return parsed;
}
