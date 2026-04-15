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
import { getEffectiveAPIMode } from "@/lib/aiService";
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

/** Vision API 共通でサポートされる MIME 型 / MIME types commonly supported across Vision APIs. */
type SupportedMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/**
 * File の MIME から Vision API で受け付けられるメディアタイプを決定する。
 * 未対応の MIME（例: image/heic）は `null` を返し、呼び出し側で弾く。
 *
 * Resolve a Vision-supported media type from the file's MIME.
 * Returns `null` for unsupported MIMEs (e.g. HEIC); the caller must reject.
 */
function resolveMediaType(file: File): SupportedMediaType | null {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return "image/jpeg";
  if (type === "image/png") return "image/png";
  if (type === "image/gif") return "image/gif";
  if (type === "image/webp") return "image/webp";
  return null;
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

  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw new DOMException("describeImage aborted", "AbortError");
    }
  };

  throwIfAborted();
  if (!settings.isConfigured) {
    throw new Error("AI provider is not configured / AI 設定が未構成です");
  }
  if (settings.provider === "claude-code") {
    throw new Error(
      "claude-code provider does not support image description in this version / claude-code では画像説明は未対応です",
    );
  }
  // 本 PR では server API 経由の Vision 呼び出しに未対応。バックエンド実装が必要なため
  // 明示的にエラーで弾いてユーザーに誘導する。
  // This PR does not implement server-mode Vision yet; surface a clear error.
  if (getEffectiveAPIMode(settings) === "api_server") {
    throw new Error(
      "Image description via the Zedi server API is not yet supported. Switch to 'user API key' mode in AI settings. / 画像解析は現在サーバー API モードでは未対応です。AI 設定で「ユーザー API キー」モードに切り替えてください。",
    );
  }

  const mediaType = resolveMediaType(file);
  if (!mediaType) {
    throw new Error(
      `Unsupported image type for Vision API: ${file.type || "unknown"} / Vision API が対応していない画像形式です`,
    );
  }

  const finalPrompt = prompt ?? getDefaultPrompt();
  const base64 = await fileToBase64(file);

  throwIfAborted();

  const client = createAIClient(settings);

  switch (settings.provider) {
    case "openai": {
      const openai = client as OpenAI;
      const dataUrl = `data:${mediaType};base64,${base64}`;
      // OpenAI SDK は第二引数で signal を受け取る / OpenAI SDK accepts { signal } as request options.
      const response = await openai.chat.completions.create(
        {
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
        },
        { signal },
      );
      throwIfAborted();
      const text = response.choices?.[0]?.message?.content;
      return typeof text === "string" ? text : "";
    }

    case "anthropic": {
      const anthropic = client as Anthropic;
      // Anthropic SDK も第二引数で signal を受け取る / Anthropic SDK also takes { signal } request options.
      const response = await anthropic.messages.create(
        {
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
        },
        { signal },
      );
      throwIfAborted();
      const textBlock = response.content?.find(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );
      return textBlock?.text ?? "";
    }

    case "google": {
      const google = client as GoogleGenAI;
      // @google/genai は config.abortSignal で signal を受け取る
      // @google/genai takes the signal via config.abortSignal.
      const response = await google.models.generateContent({
        model: settings.model,
        contents: [
          {
            parts: [{ inlineData: { mimeType: mediaType, data: base64 } }, { text: finalPrompt }],
          },
        ],
        config: signal ? { abortSignal: signal } : undefined,
      });
      throwIfAborted();
      // `response.text` は @google/genai の getter で string | undefined を返す
      // `response.text` is a getter on @google/genai that returns `string | undefined`.
      const text = response.text;
      return typeof text === "string" ? text : "";
    }

    default: {
      const _exhaustive: never = settings.provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}
