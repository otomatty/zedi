/**
 * Gemini 画像生成サービス
 */
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';

export interface GenerateImageResult {
  imageUrl: string; // data URI
  mimeType: string;
}

export async function generateImageWithGemini(
  prompt: string,
  apiKey: string,
  options?: { model?: string; aspectRatio?: string },
): Promise<GenerateImageResult> {
  if (!prompt || !apiKey) throw new Error('Prompt and API key are required');

  const model = options?.model || DEFAULT_IMAGE_MODEL;
  const aspectRatio = options?.aspectRatio || '16:9';

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio },
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const response = await fetch(`${API_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Gemini API failed: ${response.status} - ${text}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
    error?: { code?: number; message?: string };
  };

  if (data.error) {
    throw new Error(`Gemini error: ${data.error.code} - ${data.error.message || 'Unknown'}`);
  }

  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts?.length) {
    throw new Error('No image data in Gemini response');
  }

  for (const part of candidate.content.parts) {
    if (part.inlineData?.data && part.inlineData?.mimeType) {
      const mimeType = part.inlineData.mimeType;
      const imageUrl = `data:${mimeType};base64,${part.inlineData.data}`;
      return { imageUrl, mimeType };
    }
  }

  throw new Error('No image data in Gemini response');
}
