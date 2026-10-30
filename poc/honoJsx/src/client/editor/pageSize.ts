import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { LONG_PAGE_BLOCKS } from "../../shared/import/splitDocument";
import { createTrailingDebounce } from "./caretScheduling";

/**
 * Number of text blocks in a document, without visiting their inline content.
 * 文書内のテキストブロック数（インライン要素は辿らない）。
 */
export function countTextblocks(doc: PMNode): number {
  let count = 0;
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    count += 1;
    return false;
  });
  return count;
}

/** Whether a page is long enough that collaborative typing slows down. */
export const isLongPage = (textblocks: number) => textblocks > LONG_PAGE_BLOCKS;

/**
 * Reports the page size now and again once edits pause, so long documents do not pay for
 * a full count on every keystroke. Returns a function that stops watching.
 * 現在のページサイズを通知し、編集が止まったら再通知する（長文で毎キー全数えしない）。
 */
export function watchPageSize(
  editor: Editor,
  onChange: (textblocks: number) => void,
  waitMs = 1000,
): () => void {
  const report = () => onChange(countTextblocks(editor.state.doc));
  const recount = createTrailingDebounce(report, waitMs);
  const onUpdate = () => recount.schedule();
  editor.on("update", onUpdate);
  report();
  return () => {
    editor.off("update", onUpdate);
    recount.cancel();
  };
}
