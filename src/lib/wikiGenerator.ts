// Wiki Generator - Wikipedia風コンテンツ生成機能（ストリーミング対応）

import { AISettings } from "@/types/ai";
import { loadAISettings } from "./aiSettings";
import { WIKI_GENERATOR_PROMPT } from "./wikiGenerator/wikiGeneratorPrompt";
import {
  extractWikiLinks,
  type WikiGeneratorResult,
  type WikiGeneratorCallbacks,
} from "./wikiGenerator/wikiGeneratorUtils";
import {
  generateWithOpenAI,
  generateWithAnthropic,
  generateWithGoogle,
} from "./wikiGenerator/wikiGeneratorProviders";
import { streamWikiStyleFromFullPrompt } from "./wikiGenerator/wikiGeneratorStreamFullPrompt";
import { buildChatPageWikiUserPrompt } from "./wikiGenerator/wikiGeneratorFromChatPrompt";

export type { WikiGeneratorResult, WikiGeneratorCallbacks };
export { extractWikiLinks };

/**
 * AI設定を取得し、設定されているか確認
 * api_serverモードではシステムプロバイダーが利用可能なため常にOK
 */
export async function getAISettingsOrThrow(): Promise<AISettings> {
  const settings = await loadAISettings();

  if (!settings) {
    const { DEFAULT_AI_SETTINGS } = await import("@/types/ai");
    return { ...DEFAULT_AI_SETTINGS, isConfigured: true };
  }

  const effectiveMode = settings.apiMode || (settings.apiKey ? "user_api_key" : "api_server");
  if (effectiveMode === "api_server") {
    return { ...settings, isConfigured: true };
  }

  if (settings.provider === "claude-code") {
    return { ...settings, isConfigured: true };
  }

  if (!settings.isConfigured || !settings.apiKey) {
    throw new Error("AI_NOT_CONFIGURED");
  }
  return settings;
}

/**
 * Wikiコンテンツをストリーミング生成
 * api_serverモード / claude-code: callAIService経由でサーバーに委譲
 * user_api_keyモード: 直接SDKで呼び出し（既存動作）
 */
export async function generateWikiContentStream(
  title: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  try {
    const settings = await getAISettingsOrThrow();
    const effectiveMode = settings.apiMode || (settings.apiKey ? "user_api_key" : "api_server");

    if (settings.provider === "claude-code" || effectiveMode === "api_server") {
      const { callAIService } = await import("@/lib/aiService");
      const prompt = WIKI_GENERATOR_PROMPT.replace("{{title}}", title);
      let fullContent = "";

      await callAIService(
        settings,
        {
          provider: settings.provider,
          model: settings.model,
          messages: [{ role: "user", content: prompt }],
          options: {
            maxTokens: 4000,
            temperature: 0.7,
            stream: true,
            feature: "wiki_generation",
          },
        },
        {
          onChunk: (chunk) => {
            fullContent += chunk;
            callbacks.onChunk(chunk);
          },
          onComplete: (response) => {
            const content = response.content ?? fullContent;
            callbacks.onComplete({
              content,
              wikiLinks: extractWikiLinks(content),
            });
          },
          onError: (error) => callbacks.onError(error),
        },
        abortSignal,
      );
      return;
    }

    switch (settings.provider) {
      case "openai":
        await generateWithOpenAI(settings, title, callbacks, abortSignal);
        break;
      case "anthropic":
        await generateWithAnthropic(settings, title, callbacks, abortSignal);
        break;
      case "google":
        await generateWithGoogle(settings, title, callbacks, abortSignal);
        break;
      case "claude-code":
        throw new Error("Wiki generation is not supported with Claude Code provider.");
      default: {
        const _exhaustive: never = settings.provider;
        throw new Error(`Unknown provider: ${_exhaustive}`);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      callbacks.onError(error);
    } else {
      callbacks.onError(new Error("Unknown error occurred"));
    }
  }
}

/**
 * Generate full page Markdown from chat outline + conversation (streaming).
 * アウトラインと会話文脈からページ本文をストリーミング生成する。
 */
export async function generateWikiContentFromChatOutlineStream(
  title: string,
  outline: string,
  conversationText: string,
  callbacks: WikiGeneratorCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const userPrompt = buildChatPageWikiUserPrompt(title, outline, conversationText);
  try {
    const settings = await getAISettingsOrThrow();
    const effectiveMode = settings.apiMode || (settings.apiKey ? "user_api_key" : "api_server");

    if (settings.provider === "claude-code" || effectiveMode === "api_server") {
      const { callAIService } = await import("@/lib/aiService");
      let fullContent = "";

      await callAIService(
        settings,
        {
          provider: settings.provider,
          model: settings.model,
          messages: [{ role: "user", content: userPrompt }],
          options: {
            maxTokens: 4000,
            temperature: 0.7,
            stream: true,
            feature: "chat_page_generation",
          },
        },
        {
          onChunk: (chunk) => {
            fullContent += chunk;
            callbacks.onChunk(chunk);
          },
          onComplete: (response) => {
            const content = response.content ?? fullContent;
            callbacks.onComplete({
              content,
              wikiLinks: extractWikiLinks(content),
            });
          },
          onError: (error) => callbacks.onError(error),
        },
        abortSignal,
      );
      return;
    }

    await streamWikiStyleFromFullPrompt(settings, userPrompt, callbacks, abortSignal);
  } catch (error) {
    if (error instanceof Error) {
      callbacks.onError(error);
    } else {
      callbacks.onError(new Error("Unknown error occurred"));
    }
  }
}

export { convertMarkdownToTiptapContent } from "./markdownToTiptap";
