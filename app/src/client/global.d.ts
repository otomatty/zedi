import type { Editor } from "@tiptap/core";
import type * as Y from "yjs";

declare global {
  interface Window {
    /** Debug/measurement handle used by scripts/measure.mjs. */
    __zediApp?: { editor?: Editor; doc?: Y.Doc; aiDone?: boolean; aiTokens?: number };
  }
}
