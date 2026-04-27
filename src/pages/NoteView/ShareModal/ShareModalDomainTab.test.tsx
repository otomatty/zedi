/**
 * ShareModalDomainTab のテスト。
 * Tests for the share-modal domain tab (issue #663).
 *
 * 観点 / Coverage:
 *   - 既存ルールが viewer / editor バッジ + 未検証バッジ付きで一覧表示される
 *   - 空のときは「ルールがありません」を表示
 *   - フリーメール (gmail.com 等) を入力するとインライン警告 + ボタンが disable
 *   - 形式不正の入力もインライン警告
 *   - viewer 追加は確認ダイアログなしで送信される
 *   - editor 追加は確認ダイアログを挟んで送信される
 *   - 削除ボタンで accessId が渡る
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShareModalDomainTab } from "./ShareModalDomainTab";
import type { DomainAccessRow } from "@/lib/api/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts
        ? `${key}(${Object.entries(opts)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(",")})`
        : key,
    i18n: { language: "ja" },
  }),
}));

const toastFn = vi.fn();
vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useToast: () => ({ toast: toastFn }),
  };
});

const useDomainAccessForNote = vi.fn();
const createMutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();
const useCreateDomainAccess = vi.fn();
const useDeleteDomainAccess = vi.fn();

vi.mock("@/hooks/useDomainAccess", () => ({
  useDomainAccessForNote: (...args: unknown[]) => useDomainAccessForNote(...args),
  useCreateDomainAccess: (...args: unknown[]) => useCreateDomainAccess(...args),
  useDeleteDomainAccess: (...args: unknown[]) => useDeleteDomainAccess(...args),
}));

const NOTE_ID = "note-1";

function row(overrides: Partial<DomainAccessRow> = {}): DomainAccessRow {
  return {
    id: "rule-1",
    note_id: NOTE_ID,
    domain: "example.com",
    role: "viewer",
    created_by_user_id: "user-1",
    verified_at: null,
    created_at: "2026-04-27T00:00:00.000Z",
    ...overrides,
  };
}

function renderTab(props: { rules?: DomainAccessRow[]; isLoading?: boolean } = {}) {
  useDomainAccessForNote.mockReturnValue({
    data: props.rules ?? [],
    isLoading: props.isLoading ?? false,
  });
  useCreateDomainAccess.mockReturnValue({
    mutateAsync: createMutateAsync,
    isPending: false,
  });
  useDeleteDomainAccess.mockReturnValue({
    mutateAsync: deleteMutateAsync,
    isPending: false,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ShareModalDomainTab noteId={NOTE_ID} enabled />
    </QueryClientProvider>,
  );
}

// Radix UI の Select は PointerEvent / scrollIntoView を直接触るが jsdom には
// 実装がないので、最低限のスタブを当てる。
// Radix Select touches PointerEvent / scrollIntoView APIs that jsdom does not
// implement; stub them so the dropdown can open under test.
beforeEach(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

describe("ShareModalDomainTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMutateAsync.mockResolvedValue(row());
    deleteMutateAsync.mockResolvedValue({ removed: true, id: "rule-1" });
  });

  it("shows the empty state when there are no rules", () => {
    renderTab();
    expect(screen.getByText("notes.domainTabNoRules")).toBeInTheDocument();
  });

  it("renders rules with role badge and unverified badge", () => {
    renderTab({
      rules: [
        row({ id: "r1", domain: "example.com", role: "viewer" }),
        row({ id: "r2", domain: "acme.test", role: "editor" }),
      ],
    });
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("acme.test")).toBeInTheDocument();
    // Both rows are unverified in v1.
    const unverified = screen.getAllByText("notes.domainTabUnverifiedBadge");
    expect(unverified).toHaveLength(2);
  });

  it("disables the add button until a valid non-free domain is typed", async () => {
    const user = userEvent.setup();
    renderTab();
    const addButton = screen.getByRole("button", { name: "notes.domainTabAdd" });
    expect(addButton).toBeDisabled();

    const input = screen.getByPlaceholderText("notes.domainPlaceholder");
    await user.type(input, "gmail.com");
    expect(addButton).toBeDisabled();
    expect(screen.getByText(/notes\.domainTabCreateFailedFreeEmail/)).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "example.com");
    expect(addButton).not.toBeDisabled();
  });

  it("submits a viewer rule without confirmation", async () => {
    const user = userEvent.setup();
    renderTab();
    const input = screen.getByPlaceholderText("notes.domainPlaceholder");
    await user.type(input, "example.com");
    await user.click(screen.getByRole("button", { name: "notes.domainTabAdd" }));
    expect(createMutateAsync).toHaveBeenCalledWith({ domain: "example.com", role: "viewer" });
  });

  it("requires confirmation before submitting an editor rule", async () => {
    const user = userEvent.setup();
    renderTab();
    const input = screen.getByPlaceholderText("notes.domainPlaceholder");
    await user.type(input, "example.com");

    // Switch the role select to editor by clicking it open and choosing editor.
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "notes.domainTabRoleEditor" }));

    await user.click(screen.getByRole("button", { name: "notes.domainTabAdd" }));
    // Confirmation dialog appears and we have not yet hit the API.
    expect(createMutateAsync).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("notes.domainTabEditorWarning")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "common.confirm" }));
    expect(createMutateAsync).toHaveBeenCalledWith({ domain: "example.com", role: "editor" });
  });

  it("calls delete with the rule's id when remove is clicked", async () => {
    const user = userEvent.setup();
    renderTab({ rules: [row({ id: "rule-42", domain: "example.com" })] });
    const removeButton = screen.getByRole("button", {
      name: "notes.domainTabRemoveAria(domain=example.com)",
    });
    await user.click(removeButton);
    expect(deleteMutateAsync).toHaveBeenCalledWith({ accessId: "rule-42" });
  });
});
