export interface SSEWriter {
  send: (payload: unknown) => void;
  close: () => void;
  error: (err: unknown) => void;
}

export function createSSEStream(
  handler: (writer: SSEWriter) => Promise<void> | void
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const writer: SSEWriter = {
        send: (payload) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        },
        close: () => {
          controller.close();
        },
        error: (err) => {
          console.error("SSE stream error", err);
          controller.error(err);
        },
      };

      try {
        await handler(writer);
      } catch (error) {
        writer.error(error);
      }
    },
  });
}

export async function consumeSSEStream(
  stream: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
  abortSignal?: AbortSignal
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (abortSignal?.aborted) {
      throw new Error("ABORTED");
    }

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          return;
        }
        if (data) {
          onData(data);
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }
}
