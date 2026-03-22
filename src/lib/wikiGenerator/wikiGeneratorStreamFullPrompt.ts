/**
 * Stream wiki-style Markdown from a single full user prompt (e.g. chat outline → page body).
 * 完全なユーザープロンプトから百科風 Markdown をストリーミング（チャットアウトライン→本文など）。
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { AISettings } from "@/types/ai";
import { extractWikiLinks, type WikiGeneratorCallbacks } from "./wikiGeneratorUtils";

/**
 * OpenAI: stream a full user prompt (e.g. chat-outline → page body).
 */
async function streamOpenAIFullPrompt(
  settings: AISettings,
  fullUserPrompt: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const stream = await client.chat.completions.create(
    {
      model: settings.model,
      messages: [{ role: "user", content: fullUserPrompt }],
      max_tokens: 4000,
      temperature: 0.7,
      stream: true,
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
 * Anthropic: stream a full user prompt.
 */
async function streamAnthropicFullPrompt(
  settings: AISettings,
  fullUserPrompt: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new Anthropic({ apiKey: settings.apiKey });
  const stream = client.messages.stream(
    {
      model: settings.model,
      max_tokens: 4000,
      messages: [{ role: "user", content: fullUserPrompt }],
    },
    { signal: abortSignal },
  );
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
 * Google: stream a full user prompt.
 */
async function streamGoogleFullPrompt(
  settings: AISettings,
  fullUserPrompt: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new GoogleGenAI({ apiKey: settings.apiKey });
  const response = await client.models.generateContentStream({
    model: settings.model,
    contents: fullUserPrompt,
    config: {
      maxOutputTokens: 4000,
      temperature: 0.7,
      ...(abortSignal && { abortSignal }),
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

/**
 * Wiki-style streaming from a complete user prompt (chat outline → page body).
 */
export async function streamWikiStyleFromFullPrompt(
  settings: AISettings,
  fullUserPrompt: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  switch (settings.provider) {
    case "openai":
      await streamOpenAIFullPrompt(settings, fullUserPrompt, callbacks, abortSignal);
      break;
    case "anthropic":
      await streamAnthropicFullPrompt(settings, fullUserPrompt, callbacks, abortSignal);
      break;
    case "google":
      await streamGoogleFullPrompt(settings, fullUserPrompt, callbacks, abortSignal);
      break;
    default:
      throw new Error(`Unknown provider: ${settings.provider}`);
  }
}
