/**
 * DomainsSection: ドメイン招待ルールの権限分岐・バリデーション・追加/削除。
 * Tests domain access rules — permissions, validation, add/remove flows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DomainsSection from "./DomainsSection";
import { NoteSettingsContext, type NoteSettingsContextValue } from "../NoteSettingsContext";
import {
  useCreateDomainAccess,
  useDeleteDomainAccess,
  useDomainAccessForNote,
} from "@/hooks/auth/useDomainAccess";
import { ApiError } from "@/lib/api";
import type { Note, NoteAccess } from "@/types/note";
import type { DomainAccessRow } from "@/lib/api/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: "ja" },
  }),
}));

const toastMock = vi.fn();
vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useToast: () => ({ toast: toastMock }),
  };
});

vi.mock("@/hooks/auth/useDomainAccess", () => ({
  useDomainAccessForNote: vi.fn(),
  useCreateDomainAccess: vi.fn(),
  useDeleteDomainAccess: vi.fn(),
}));

const baseNote: Note = {
  id: "note-1",
  ownerUserId: "user-1",
  title: "Note",
  visibility: "private",
  editPermission: "owner_only",
  isOfficial: false,
  isDefault: false,
  viewCount: 0,
  showTagFilterBar: false,
  defaultFilterTags: [],
  createdAt: 0,
  updatedAt: 0,
  isDeleted: false,
};

const ownerAccess: NoteAccess = {
  role: "owner",
  visibility: "private",
  editPermission: "owner_only",
  canView: true,
  canEdit: true,
  canManageMembers: true,
  canDeletePage: () => true,
};

const sampleRule: DomainAccessRow = {
  id: "rule-1",
  note_id: "note-1",
  domain: "company.co.jp",
  role: "viewer",
  created_by_user_id: "user-1",
  verified_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

function renderSection(overrides: Partial<NoteSettingsContextValue> = {}) {
  const value: NoteSettingsContextValue = {
    note: baseNote,
    access: ownerAccess,
    role: "owner",
    canManage: true,
    canViewAsEditor: false,
    ...overrides,
  };
  return render(
    <NoteSettingsContext.Provider value={value}>
      <DomainsSection />
    </NoteSettingsContext.Provider>,
  );
}

describe("DomainsSection", () => {
  let createMutateAsync: ReturnType<typeof vi.fn>;
  let deleteMutateAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toastMock.mockReset();
    createMutateAsync = vi.fn().mockResolvedValue(sampleRule);
    deleteMutateAsync = vi.fn().mockResolvedValue({ removed: true, id: "rule-1" });

    vi.mocked(useDomainAccessForNote).mockReturnValue({
      data: [sampleRule],
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useCreateDomainAccess).mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
    } as never);
    vi.mocked(useDeleteDomainAccess).mockReturnValue({
      mutateAsync: deleteMutateAsync,
      isPending: false,
    } as never);
  });

  it("shows no-permission message for viewers", () => {
    renderSection({
      canManage: false,
      canViewAsEditor: false,
      role: "viewer",
    });

    expect(screen.getByText("notes.noPermissionToManageMembers")).toBeInTheDocument();
    expect(screen.queryByText("notes.domainTabAddHeading")).not.toBeInTheDocument();
  });

  it("renders read-only rule list for editors without add/remove controls", () => {
    renderSection({
      canManage: false,
      canViewAsEditor: true,
      role: "editor",
    });

    expect(screen.getByText("company.co.jp")).toBeInTheDocument();
    expect(screen.queryByText("notes.domainTabAddHeading")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: 'notes.domainTabRemoveAria:{"domain":"company.co.jp"}',
      }),
    ).not.toBeInTheDocument();
  });

  it("shows loading state while rules are fetching", () => {
    vi.mocked(useDomainAccessForNote).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);

    renderSection();

    expect(screen.getByText("notes.domainTabLoading")).toBeInTheDocument();
  });

  it("shows alert when rule fetch fails", () => {
    vi.mocked(useDomainAccessForNote).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never);

    renderSection();

    expect(screen.getByRole("alert")).toHaveTextContent("notes.domainTabLoadFailed");
  });

  it("shows empty state when there are no rules", () => {
    vi.mocked(useDomainAccessForNote).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);

    renderSection();

    expect(screen.getByText("notes.domainTabNoRules")).toBeInTheDocument();
  });

  it("shows unverified badge for rules without verified_at", () => {
    renderSection();

    expect(screen.getByText("notes.domainTabUnverifiedBadge")).toBeInTheDocument();
  });

  it("disables add for invalid domain format and shows inline error", () => {
    renderSection();
    const input = screen.getByPlaceholderText("notes.domainPlaceholder");

    fireEvent.change(input, { target: { value: "not-a-domain" } });

    expect(screen.getByText("notes.domainTabCreateFailedInvalid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "notes.domainTabAdd" })).toBeDisabled();
  });

  it("rejects free email domains with an inline error", () => {
    renderSection();
    const input = screen.getByPlaceholderText("notes.domainPlaceholder");

    fireEvent.change(input, { target: { value: "gmail.com" } });

    expect(
      screen.getByText('notes.domainTabCreateFailedFreeEmail:{"domain":"gmail.com"}'),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "notes.domainTabAdd" })).toBeDisabled();
  });

  it("normalizes @-prefixed domains before create", async () => {
    renderSection();
    const input = screen.getByPlaceholderText("notes.domainPlaceholder");

    fireEvent.change(input, { target: { value: "@acme.co.jp" } });
    fireEvent.click(screen.getByRole("button", { name: "notes.domainTabAdd" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        domain: "acme.co.jp",
        role: "viewer",
      });
    });
  });

  it("disables add when input is empty so create is not triggered", () => {
    renderSection();

    expect(screen.getByRole("button", { name: "notes.domainTabAdd" })).toBeDisabled();
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("creates a viewer rule immediately and resets the form", async () => {
    renderSection();
    const input = screen.getByPlaceholderText("notes.domainPlaceholder");

    fireEvent.change(input, { target: { value: "acme.co.jp" } });
    fireEvent.click(screen.getByRole("button", { name: "notes.domainTabAdd" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        domain: "acme.co.jp",
        role: "viewer",
      });
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "notes.domainTabCreated" });
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("opens confirmation dialog before creating an editor rule", async () => {
    renderSection();
    const input = screen.getByPlaceholderText("notes.domainPlaceholder");

    fireEvent.change(input, { target: { value: "acme.co.jp" } });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "notes.domainTabRoleEditor" }));
    fireEvent.click(screen.getByRole("button", { name: "notes.domainTabAdd" }));

    expect(screen.getByText("notes.domainTabEditorWarning")).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "common.confirm" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        domain: "acme.co.jp",
        role: "editor",
      });
    });
  });

  it("does not create a rule when editor confirmation is cancelled", async () => {
    renderSection();
    const input = screen.getByPlaceholderText("notes.domainPlaceholder");

    fireEvent.change(input, { target: { value: "acme.co.jp" } });
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "notes.domainTabRoleEditor" }));
    fireEvent.click(screen.getByRole("button", { name: "notes.domainTabAdd" }));
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));

    expect(createMutateAsync).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("acme.co.jp");
  });

  it("shows destructive toast when API rejects a duplicate domain", async () => {
    createMutateAsync.mockRejectedValueOnce(new ApiError("domain already exists", 409));
    renderSection();
    const input = screen.getByPlaceholderText("notes.domainPlaceholder");

    fireEvent.change(input, { target: { value: "company.co.jp" } });
    fireEvent.click(screen.getByRole("button", { name: "notes.domainTabAdd" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        domain: "company.co.jp",
        role: "viewer",
      });
      expect(toastMock).toHaveBeenCalledWith({
        title: "notes.domainTabCreateFailed",
        description: "domain already exists",
        variant: "destructive",
      });
    });
  });

  it("removes a rule and shows success toast", async () => {
    renderSection();

    fireEvent.click(
      screen.getByRole("button", {
        name: 'notes.domainTabRemoveAria:{"domain":"company.co.jp"}',
      }),
    );

    await waitFor(() => {
      expect(deleteMutateAsync).toHaveBeenCalledWith({ accessId: "rule-1" });
    });
    expect(toastMock).toHaveBeenCalledWith({ title: "notes.domainTabRemoved" });
  });

  it("shows destructive toast when delete fails", async () => {
    deleteMutateAsync.mockRejectedValueOnce(new Error("network"));
    renderSection();

    fireEvent.click(
      screen.getByRole("button", {
        name: 'notes.domainTabRemoveAria:{"domain":"company.co.jp"}',
      }),
    );

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: "notes.domainTabRemoveFailed",
        variant: "destructive",
      });
    });
  });
});
