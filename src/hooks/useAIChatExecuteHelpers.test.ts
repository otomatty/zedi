import { describe, it, expect } from "vitest";
import {
  dedupeReferencedPagesById,
  collectReferencedPagesFromMessages,
  buildApiPayload,
} from "./useAIChatExecuteHelpers";
import type { ChatMessage, ReferencedPage } from "../types/aiChat";

describe("useAIChatExecuteHelpers", () => {
  it("dedupeReferencedPagesById keeps first occurrence", () => {
    const refs: ReferencedPage[] = [
      { id: "1", title: "A" },
      { id: "1", title: "B" },
    ];
    expect(dedupeReferencedPagesById(refs)).toEqual([{ id: "1", title: "A" }]);
  });

  it("collectReferencedPagesFromMessages flattens and dedupes", () => {
    const shared: ReferencedPage = { id: "p", title: "Page" };
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        content: "a",
        timestamp: 1,
        referencedPages: [shared],
      },
      {
        id: "u2",
        role: "user",
        content: "b",
        timestamp: 2,
        referencedPages: [shared],
      },
    ];
    expect(collectReferencedPagesFromMessages(messages)).toEqual([shared]);
  });

  it("buildApiPayload includes user tail when provided", () => {
    const base: ChatMessage[] = [{ id: "u", role: "user", content: "hi", timestamp: 1 }];
    const tail: ChatMessage = { id: "u2", role: "user", content: "there", timestamp: 2 };
    expect(buildApiPayload(base, tail)).toEqual([
      { role: "user", content: "hi" },
      { role: "user", content: "there" },
    ]);
  });
});
