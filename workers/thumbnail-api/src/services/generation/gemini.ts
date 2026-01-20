const DEFAULT_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";

interface GeminiGenerateContentRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig?: {
    imageConfig?: {
      aspectRatio?: string;
    };
    responseModalities?: string[];
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

interface GeminiInlineData {
  mimeType?: string;
  data?: string;
}

interface GeminiContentPart {
  text?: string;
  inlineData?: GeminiInlineData;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiContentPart[];
  };
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
    code?: number;
  };
}

export interface GenerateImageResult {
  imageUrl: string; // base64データURI
  mimeType: string;
}

export async function generateImageWithGemini(
  prompt: string,
  apiKey: string,
  options?: {
    model?: string;
    aspectRatio?: string;
  }
): Promise<GenerateImageResult> {
  if (!prompt || !apiKey) {
    throw new Error("Prompt and API key are required");
  }

  const model = options?.model || DEFAULT_IMAGE_MODEL;
  const aspectRatio = options?.aspectRatio || "16:9";

  const requestBody: GeminiGenerateContentRequest = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio,
      },
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
    ],
  };

  const response = await fetch(
    `${DEFAULT_GEMINI_API_BASE}/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Gemini API request failed: ${response.status} - ${errorText}`
    );
  }

  const data = (await response.json()) as GeminiGenerateContentResponse;

  if (data.error) {
    throw new Error(
      `Gemini API error: ${data.error.code} - ${data.error.message || "Unknown error"}`
    );
  }

  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error("No candidate returned from Gemini API");
  }

  const parts = candidate.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error("No content parts returned from Gemini API");
  }

  // 画像データを探す
  for (const part of parts) {
    if (part.inlineData?.data && part.inlineData?.mimeType) {
      const mimeType = part.inlineData.mimeType;
      const base64Data = part.inlineData.data;
      const imageUrl = `data:${mimeType};base64,${base64Data}`;

      return {
        imageUrl,
        mimeType,
      };
    }
  }

  throw new Error("No image data found in Gemini API response");
}
