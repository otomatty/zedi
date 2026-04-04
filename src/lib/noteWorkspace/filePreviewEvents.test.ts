import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchFilePreview, FILE_PREVIEW_EVENT } from "./filePreviewEvents";

describe("filePreviewEvents", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatchFilePreview emits CustomEvent with detail", () => {
    const spy = vi.fn();
    window.addEventListener(FILE_PREVIEW_EVENT, spy);
    dispatchFilePreview({ relativePath: "a/b.ts", content: "hi", truncated: false });
    expect(spy).toHaveBeenCalledTimes(1);
    const ev = spy.mock.calls[0][0] as CustomEvent;
    expect(ev.detail).toEqual({ relativePath: "a/b.ts", content: "hi", truncated: false });
    window.removeEventListener(FILE_PREVIEW_EVENT, spy);
  });
});
