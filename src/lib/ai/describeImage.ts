// LLM Vision を使って画像の内容を説明する文章を生成するラッパー
// Wrapper that generates a natural-language description of an image using an LLM Vision model.
//
// プロバイダー別に SDK の multimodal メッセージ仕様を吸収する。
// It normalizes the multimodal-message shape of each provider SDK.

import type OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";
import type { GoogleGenAI } from "@google/genai";
import i18n from "@/i18n";
import type { AISettings } from "@/types/ai";
import { createAIClient } from "@/lib/aiClient";
import { fileToBase64 } from "@/lib/storage/types";

/**
 * describeImage に渡すオプション
 * Options for {@link describeImage}.
 */
export interface DescribeImageOptions {
  /** 中断用の signal / AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** プロンプト上書き / Override the default prompt. */
  prompt?: string;
}

const DEFAULT_MAX_TOKENS = 1024;

const DEFAULT_PROMPT_JA =
  "この画像の内容を、見出し・表・図・重要なテキスト要素を含めて、ページ本文として使える自然な日本語で簡潔に説明してください。";
const DEFAULT_PROMPT_EN =
  "Describe this image concisely, including headings, tables, diagrams, and any important text, in language suitable for a document body.";

/**
 * 現在の UI ロケールに応じたデフォルトプロンプトを返す
 * Pick the default prompt based on the current UI locale.
 */
function getDefaultPrompt(): string {
  const lang = i18n?.language;
  if (typeof lang === "string" && lang.toLowerCase().startsWith("ja")) {
    return DEFAULT_PROMPT_JA;
  }
  return DEFAULT_PROMPT_EN;
}

/**
 * File の MIME からメディアタイプを決定する。不明なら image/png にフォールバック。
 * Resolve the media type from the file's MIME, falling back to image/png.
 */
function resolveMediaType(file: File): "image/png" | "image/jpeg" | "image/gif" | "image/webp" {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return "image/jpeg";
  if (type === "image/gif") return "image/gif";
  if (type === "image/webp") return "image/webp";
  return "image/png";
}

/**
 * LLM Vision API を呼び出して画像の説明を生成する。
 * Call an LLM Vision API and return a description of the image.
 *
 * @throws AI 設定が未構成 (`AISettings.isConfigured === false`) の場合
 *         Throws when AI settings are not configured.
 * @throws claude-code プロバイダー（本ラッパー未対応）の場合
 *         Throws for the claude-code provider (not yet supported).
 */
export async function describeImage(
  file: File,
  settings: AISettings,
  options: DescribeImageOptions = {},
): Promise<string> {
  const { signal, prompt } = options;

  if (signal?.aborted) {
    throw new DOMException("describeImage aborted", "AbortError");
  }
  if (!settings.isConfigured) {
    throw new Error("AI provider is not configured / AI 設定が未構成です");
  }
  if (settings.provider === "claude-code") {
    throw new Error(
      "claude-code provider does not support image description in this version / claude-code では画像説明は未対応です",
    );
  }

  const finalPrompt = prompt ?? getDefaultPrompt();
  const mediaType = resolveMediaType(file);
  const base64 = await fileToBase64(file);

  if (signal?.aborted) {
    throw new DOMException("describeImage aborted", "AbortError");
  }

  const client = createAIClient(settings);

  switch (settings.provider) {
    case "openai": {
      const openai = client as OpenAI;
      const dataUrl = `data:${mediaType};base64,${base64}`;
      const response = await openai.chat.completions.create({
        model: settings.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: finalPrompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      });
      const text = response.choices?.[0]?.message?.content;
      return typeof text === "string" ? text : "";
    }

    case "anthropic": {
      const anthropic = client as Anthropic;
      const response = await anthropic.messages.create({
        model: settings.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: finalPrompt },
            ],
          },
        ],
      });
      const textBlock = response.content?.find(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );
      return textBlock?.text ?? "";
    }

    case "google": {
      const google = client as GoogleGenAI;
      const response = await google.models.generateContent({
        model: settings.model,
        contents: [
          {
            parts: [{ inlineData: { mimeType: mediaType, data: base64 } }, { text: finalPrompt }],
          },
        ],
      });
      // `response.text` は @google/genai の getter で完成文字列を返す
      // `response.text` is a getter on @google/genai that returns the concatenated text.
      const text = (response as { text?: string | (() => string) }).text;
      if (typeof text === "function") return text() ?? "";
      return typeof text === "string" ? text : "";
    }

    default: {
      const _exhaustive: never = settings.provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}
