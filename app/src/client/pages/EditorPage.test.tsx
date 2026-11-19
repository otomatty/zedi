// @vitest-environment happy-dom
import { waitFor } from "@testing-library/dom";
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageDetail } from "../../shared/types";

const page: PageDetail = {
  id: "p1",
  noteId: "n1",
  title: "Shared page",
  preview: "",
  updatedAt: 1,
  role: "viewer",
};

vi.mock("../lib/query", () => ({
  useQuery: () => ({ status: "success", data: page }),
}));

const { default: EditorPage } = await import("./EditorPage");

afterEach(() => {
  window.__zediApp?.editor?.destroy();
  window.__zediApp = undefined;
  history.replaceState(null, "", "/");
  document.body.innerHTML = "";
});

describe("EditorPage", () => {
  it("keeps a viewer read-only when the page is opened without collaboration (?collab=0)", async () => {
    // 計測用の切り替えでも閲覧専用の制限は外さない。
    // The investigation switch must not lift the viewer restriction.
    history.replaceState(null, "", "/pages/p1?collab=0");
    const container = document.createElement("div");
    document.body.append(container);

    render(<EditorPage id="p1" defaultNoteId="n1" />, container);

    await waitFor(() => expect(window.__zediApp?.editor).toBeDefined());
    expect(window.__zediApp?.editor?.isEditable).toBe(false);
  });
});
