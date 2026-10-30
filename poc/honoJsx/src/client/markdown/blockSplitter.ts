const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const ATX_HEADING = /^ {0,3}#{1,6}(?:\s|$)/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+) *$/;
const LIST_ITEM = /^ {0,3}(?:([-*+])|\d{1,9}[.)])\s/;
const INDENTED = /^(?: {2,}|\t)/;
/** A partial line starting with one of these may still turn into a list-item continuation. */
const AMBIGUOUS_START = /^[\s\-*+\d]/;

type ListKind = "ul" | "ol" | null;
const listKind = (line: string): ListKind => {
  const match = LIST_ITEM.exec(line);
  if (!match) return null;
  return match[1] ? "ul" : "ol";
};
const isParagraphLine = (line: string) => !listKind(line) && !/^ {0,3}[>|]/.test(line);

/** Incremental splitter that turns streamed Markdown into independently renderable blocks. */
export interface BlockSplitter {
  /** Adds text and returns blocks that can no longer change. */
  push(text: string): string[];
  /** The block still being written (re-render this on every frame). */
  tail(): string;
  /** Ends the stream and returns everything that is left as completed blocks. */
  finish(): string[];
}

/**
 * Splits streamed Markdown at block boundaries where CommonMark also starts a new block,
 * so rendering the blocks one by one gives the same result as rendering the whole text.
 * Fenced code, loose lists and setext headings are kept together.
 * ストリーミング中の Markdown を、CommonMark でもブロックが切れる位置で分割する。
 * 個別に描画しても全体の描画と同じ結果になる（コードブロック・ゆるいリスト・setext 見出しは分けない）。
 */
export function createBlockSplitter(): BlockSplitter {
  let partial = "";
  let lines: string[] = [];
  let blankAfter = false;
  let fence: { marker: string; standalone: boolean } | null = null;
  const done: string[] = [];

  const emit = () => {
    while (lines.length > 0 && (lines.at(-1) ?? "").trim() === "") lines.pop();
    if (lines.length > 0) done.push(lines.join("\n"));
    lines = [];
    blankAfter = false;
  };

  const continuesBlock = (line: string) => {
    const first = lines[0] ?? "";
    const kind = listKind(first);
    return kind !== null && (INDENTED.test(line) || listKind(line) === kind);
  };

  const handleLine = (line: string) => {
    if (fence) {
      lines.push(line);
      const closing = new RegExp(
        `^ {0,3}${fence.marker[0] === "`" ? "`" : "~"}{${fence.marker.length},} *$`,
      );
      if (closing.test(line)) {
        const standalone = fence.standalone;
        fence = null;
        if (standalone) emit();
      }
      return;
    }
    if (line.trim() === "") {
      if (lines.length > 0) {
        lines.push(line);
        blankAfter = true;
      }
      return;
    }
    const continuation = blankAfter && continuesBlock(line);
    if (blankAfter && !continuation) emit();

    const fenceMatch = FENCE_OPEN.exec(line);
    if (fenceMatch) {
      const standalone = !continuation;
      if (standalone) emit();
      lines.push(line);
      fence = { marker: fenceMatch[1] as string, standalone };
      blankAfter = false;
      return;
    }
    if (!continuation && ATX_HEADING.test(line)) {
      emit();
      done.push(line);
      return;
    }
    if (
      !continuation &&
      lines.length > 0 &&
      SETEXT_UNDERLINE.test(line) &&
      isParagraphLine(lines[0] ?? "")
    ) {
      lines.push(line);
      emit();
      return;
    }
    if (!continuation && THEMATIC_BREAK.test(line)) {
      emit();
      done.push(line);
      return;
    }
    lines.push(line);
    blankAfter = false;
  };

  return {
    push(text) {
      partial += text;
      let newline = partial.indexOf("\n");
      while (newline !== -1) {
        handleLine(partial.slice(0, newline));
        partial = partial.slice(newline + 1);
        newline = partial.indexOf("\n");
      }
      // A non-blank line that cannot be a continuation already proves the previous block is done.
      if (!fence && blankAfter && partial !== "" && !AMBIGUOUS_START.test(partial)) emit();
      return done.splice(0);
    },
    tail() {
      return lines.length > 0 ? `${lines.join("\n")}\n${partial}` : partial;
    },
    finish() {
      if (partial !== "") handleLine(partial);
      partial = "";
      fence = null;
      emit();
      return done.splice(0);
    },
  };
}
