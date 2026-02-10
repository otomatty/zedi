/**
 * SSE (Server-Sent Events) utilities for Lambda response streaming
 */

import type { SSEPayload } from "../types/index.js";

/**
 * Write an SSE event to a writable stream.
 */
export function writeSSE(stream: NodeJS.WritableStream, payload: SSEPayload): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  stream.write(data);
}

/**
 * Consume an SSE stream from an AI provider response.
 * Parses `data: ...` lines and invokes the callback for each parsed payload.
 */
export async function consumeProviderSSE(
  body: ReadableStream<Uint8Array>,
  onData: (raw: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");

      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload && payload !== "[DONE]") {
            onData(payload);
          }
        }

        newlineIndex = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
