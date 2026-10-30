/** One parsed server-sent event. */
export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Incremental parser for `text/event-stream`; feed it decoded chunks in order.
 * `text/event-stream` の逐次パーサー。デコード済みのチャンクを順に渡す。
 */
export function createSseParser(onEvent: (event: SseEvent) => void): { feed(chunk: string): void } {
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const handleLine = (line: string) => {
    if (line === "") {
      if (dataLines.length > 0) onEvent({ event: eventName, data: dataLines.join("\n") });
      eventName = "message";
      dataLines = [];
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
  };

  return {
    feed(chunk) {
      buffer += chunk;
      let newline = buffer.search(/\r?\n/);
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(buffer[newline] === "\r" ? newline + 2 : newline + 1);
        handleLine(line);
        newline = buffer.search(/\r?\n/);
      }
    },
  };
}
