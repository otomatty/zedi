/**
 * Wiki Generator - プロバイダー別ストリーミング生成（OpenAI / Anthropic / Google）
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AISettings } from "@/types/ai";
import { WIKI_GENERATOR_PROMPT } from "./wikiGeneratorPrompt";
import { extractWikiLinks, type WikiGeneratorCallbacks } from "./wikiGeneratorUtils";

/**
 * OpenAIでストリーミング生成（Web検索対応）
 */
export async function generateWithOpenAI(
  settings: AISettings,
  title: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const prompt = WIKI_GENERATOR_PROMPT.replace("{{title}}", title);
  const isSearchModel = settings.model.includes("search");
  const webSearchOptions = isSearchModel ? { search_context_size: "medium" as const } : undefined;

  const stream = await client.chat.completions.create(
    {
      model: settings.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4000,
      temperature: 0.7,
      stream: true,
      web_search_options: webSearchOptions,
    },
    { signal: abortSignal },
  );

  let fullContent = "";

  for await (const chunk of stream) {
    if (abortSignal?.aborted) throw new Error("ABORTED");
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      fullContent += content;
      callbacks.onChunk(content);
    }
  }

  callbacks.onComplete({ content: fullContent, wikiLinks: extractWikiLinks(fullContent) });
}

/**
 * Web検索をサポートするClaudeモデルかどうかを判定
 */
function isClaudeWebSearchSupported(model: string): boolean {
  const supportedPatterns = [
    "claude-opus-4",
    "claude-sonnet-4",
    "claude-sonnet-3.7",
    "claude-sonnet-3-5-sonnet",
    "claude-3-5-sonnet",
    "claude-haiku-3.5",
    "claude-3-5-haiku",
  ];
  return supportedPatterns.some((p) => model.toLowerCase().includes(p.toLowerCase()));
}

/** Anthropic messages.stream に渡すパラメータ（tools はオプション） */
interface AnthropicStreamParams {
  model: string;
  max_tokens: number;
  messages: Array<{ role: "user"; content: string }>;
  tools?: Array<{ type: "web_search_20250305"; name: string; max_uses: number }>;
}

/**
 * Anthropicでストリーミング生成（Web検索対応）
 */
export async function generateWithAnthropic(
  settings: AISettings,
  title: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new Anthropic({ apiKey: settings.apiKey });
  const prompt = WIKI_GENERATOR_PROMPT.replace("{{title}}", title);
  const useWebSearch = isClaudeWebSearchSupported(settings.model);

  const requestParams: AnthropicStreamParams = {
    model: settings.model,
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  };
  if (useWebSearch) {
    requestParams.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  }

  const stream = client.messages.stream(requestParams, { signal: abortSignal });
  let fullContent = "";

  for await (const event of stream) {
    if (abortSignal?.aborted) throw new Error("ABORTED");
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      const content = event.delta.text;
      fullContent += content;
      callbacks.onChunk(content);
    }
  }

  callbacks.onComplete({ content: fullContent, wikiLinks: extractWikiLinks(fullContent) });
}

/**
 * Google AIでストリーミング生成（Google Search Grounding対応）
 */
export async function generateWithGoogle(
  settings: AISettings,
  title: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new GoogleGenAI({ apiKey: settings.apiKey });
  const googleSearchTool = { googleSearch: {} as const };
  const prompt = WIKI_GENERATOR_PROMPT.replace("{{title}}", title);

  const response = await client.models.generateContentStream({
    model: settings.model,
    contents: prompt,
    config: {
      tools: [googleSearchTool],
      maxOutputTokens: 4000,
      temperature: 0.7,
    },
  });

  let fullContent = "";

  for await (const chunk of response) {
    if (abortSignal?.aborted) throw new Error("ABORTED");
    const content = chunk.text;
    if (content) {
      fullContent += content;
      callbacks.onChunk(content);
    }
  }

  callbacks.onComplete({ content: fullContent, wikiLinks: extractWikiLinks(fullContent) });
}
