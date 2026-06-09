import i18n from "@/i18n";
import type { ReferencedPage } from "../../types/aiChat";

const FILE_TEXT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 *
 */
export function createChipElement(id: string, title: string): HTMLSpanElement {
  /**
   *
   */
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.pageId = id;
  chip.dataset.pageTitle = title;
  chip.className =
    "inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded bg-primary/10 text-primary text-xs align-middle cursor-default select-none";
  chip.innerHTML =
    FILE_TEXT_SVG + '<span class="truncate max-w-[120px]">' + escapeHtml(title) + "</span>";
  return chip;
}

/**
 *
 */
export function getEditorContentFromEditor(editor: HTMLDivElement | null): {
  text: string;
  refs: ReferencedPage[];
} {
  if (!editor) return { text: "", refs: [] };
  /**
   *
   */
  let text = "";
  /**
   *
   */
  const refs: ReferencedPage[] = [];
  /**
   *
   */
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
    } else if (node instanceof HTMLElement) {
      if (node.dataset.pageId) {
        refs.push({ id: node.dataset.pageId, title: node.dataset.pageTitle || "" });
        text += `@${node.dataset.pageTitle || ""}`;
      } else if (node.tagName === "BR") {
        text += "\n";
      } else if (node.tagName === "DIV" || node.tagName === "P") {
        if (text.length > 0 && !text.endsWith("\n")) text += "\n";
        node.childNodes.forEach(walk);
      } else {
        node.childNodes.forEach(walk);
      }
    }
  };
  editor.childNodes.forEach(walk);
  text = text.replace(/\u00A0/g, " ").trim();
  return { text, refs };
}

/**
 *
 */
export function insertChipAtCursorInEditor(
  editor: HTMLDivElement | null,
  id: string,
  title: string,
  onAfter: () => void,
): void {
  if (!editor) return;
  /**
   *
   */
  const chip = createChipElement(id, title);
  /**
   *
   */
  const sel = window.getSelection();
  /**
   *
   */
  let inserted = false;
  if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
    /**
     *
     */
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(chip);
    inserted = true;
  }
  if (!inserted) editor.appendChild(chip);
  /**
   *
   */
  const spacer = document.createTextNode("\u00A0");
  chip.after(spacer);
  /**
   *
   */
  const cursorSel = window.getSelection();
  if (cursorSel) {
    /**
     *
     */
    const r = document.createRange();
    r.setStartAfter(spacer);
    r.collapse(true);
    cursorSel.removeAllRanges();
    cursorSel.addRange(r);
  }
  onAfter();
  editor.focus();
}

/**
 *
 */
export function replaceMentionWithChip(
  editor: HTMLDivElement | null,
  page: { id: string; title: string },
  onAfter: () => void,
): void {
  if (!editor) return;
  /**
   *
   */
  const title = page.title || i18n.t("common.untitledPage");
  /**
   *
   */
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  /**
   *
   */
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return;
  /**
   *
   */
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return;
  /**
   *
   */
  const text = node.textContent || "";
  /**
   *
   */
  const cursorPos = range.startOffset;
  /**
   *
   */
  const beforeCursor = text.slice(0, cursorPos);
  /**
   *
   */
  const lastAt = beforeCursor.lastIndexOf("@");
  if (lastAt < 0) return;
  /**
   *
   */
  const chip = createChipElement(page.id, title);
  /**
   *
   */
  const deleteRange = document.createRange();
  deleteRange.setStart(node, lastAt);
  deleteRange.setEnd(node, cursorPos);
  deleteRange.deleteContents();
  deleteRange.insertNode(chip);
  /**
   *
   */
  const spacer = document.createTextNode("\u00A0");
  chip.after(spacer);
  /**
   *
   */
  const newRange = document.createRange();
  newRange.setStartAfter(spacer);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
  onAfter();
}
