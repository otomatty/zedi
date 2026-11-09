/** Wiki Schema の編集と切り替え / Wiki Schema editing and page changes. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WikiSchemaPage from "./WikiSchemaPage";

const mocks = vi.hoisted(() => ({
  data: null as { pageId: string; title: string; content: string } | null,
  updateSchema: vi.fn(),
  toast: vi.fn(),
  isLoading: false,
  isUpdating: false,
}));

vi.mock("@/hooks/wiki/useWikiSchema", () => ({
  useWikiSchema: () => mocks,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@zedi/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@zedi/ui")>()),
  useToast: () => ({ toast: mocks.toast }),
}));

function view() {
  return (
    <MemoryRouter>
      <WikiSchemaPage />
    </MemoryRouter>
  );
}

describe("WikiSchemaPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.data = { pageId: "schema-1", title: "Schema One", content: "first body" };
    mocks.isLoading = false;
    mocks.isUpdating = false;
    mocks.updateSchema.mockResolvedValue(undefined);
  });

  it("loads remote fields, preserves edits for the same page, and resets when the page changes", () => {
    const { rerender } = render(view());
    const title = screen.getByLabelText("wikiSchema.titleLabel");
    const content = screen.getByLabelText("wikiSchema.contentLabel");
    expect(title).toHaveValue("Schema One");
    expect(content).toHaveValue("first body");
    expect(screen.getByRole("button", { name: "wikiSchema.save" })).toBeDisabled();

    fireEvent.change(title, { target: { value: "Local title" } });
    fireEvent.change(content, { target: { value: "Local body" } });
    mocks.data = { pageId: "schema-1", title: "Remote update", content: "Remote body" };
    rerender(view());

    expect(title).toHaveValue("Local title");
    expect(content).toHaveValue("Local body");
    expect(screen.getByRole("button", { name: "wikiSchema.save" })).toBeEnabled();

    mocks.data = { pageId: "schema-2", title: "Schema Two", content: "second body" };
    rerender(view());

    expect(title).toHaveValue("Schema Two");
    expect(content).toHaveValue("second body");
    expect(screen.getByRole("button", { name: "wikiSchema.save" })).toBeDisabled();
    expect(mocks.updateSchema).not.toHaveBeenCalled();
  });

  it("initializes late data with default fields when the remote title and body are empty", () => {
    mocks.data = null;
    const { rerender } = render(view());
    expect(screen.getByLabelText("wikiSchema.titleLabel")).toHaveValue("Wiki Schema");
    expect(screen.getByLabelText("wikiSchema.contentLabel")).toHaveValue("");
    expect(screen.getByRole("button", { name: "wikiSchema.save" })).toBeDisabled();

    mocks.data = { pageId: "schema-1", title: "", content: "" };
    rerender(view());

    expect(screen.getByLabelText("wikiSchema.titleLabel")).toHaveValue("Wiki Schema");
    expect(screen.getByLabelText("wikiSchema.contentLabel")).toHaveValue("");
    expect(screen.getByRole("button", { name: "wikiSchema.save" })).toBeDisabled();
  });

  it("saves the edited fields once and clears the unsaved state after success", async () => {
    render(view());
    fireEvent.change(screen.getByLabelText("wikiSchema.titleLabel"), {
      target: { value: "Edited schema" },
    });
    fireEvent.change(screen.getByLabelText("wikiSchema.contentLabel"), {
      target: { value: "Edited content" },
    });

    fireEvent.click(screen.getByRole("button", { name: "wikiSchema.save" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "wikiSchema.save" })).toBeDisabled(),
    );
    expect(mocks.updateSchema).toHaveBeenCalledExactlyOnceWith({
      title: "Edited schema",
      content: "Edited content",
    });
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({ title: "wikiSchema.saved" });
  });

  it("keeps edits available after a save failure and reports the error", async () => {
    mocks.updateSchema.mockRejectedValueOnce(new Error("save failed"));
    render(view());
    fireEvent.change(screen.getByLabelText("wikiSchema.contentLabel"), {
      target: { value: "Unsaved content" },
    });

    fireEvent.click(screen.getByRole("button", { name: "wikiSchema.save" }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
        title: "wikiSchema.saveFailed",
        variant: "destructive",
      }),
    );
    expect(mocks.updateSchema).toHaveBeenCalledExactlyOnceWith({
      title: "Schema One",
      content: "Unsaved content",
    });
    expect(screen.getByLabelText("wikiSchema.contentLabel")).toHaveValue("Unsaved content");
    expect(screen.getByRole("button", { name: "wikiSchema.save" })).toBeEnabled();
  });
});
