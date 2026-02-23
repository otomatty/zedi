import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useUser } from "@/hooks/useAuth";
import { createApiClient } from "@/lib/api";
import type {
  NoteListItem,
  GetNoteResponse,
  NoteMemberItem,
  DiscoverResponse,
} from "@/lib/api/types";
import type { Note, NoteAccess, NoteMember, NoteMemberRole } from "@/types/note";
import type { Page, PageSummary } from "@/types/page";

/** Page in a note with who added it (for canDeletePage). */
export type NotePageSummary = PageSummary & { addedByUserId: string };

export const noteKeys = {
  all: ["notes"] as const,
  lists: () => [...noteKeys.all, "list"] as const,
  list: (userId: string, userEmail?: string) =>
    [...noteKeys.lists(), userId, userEmail ?? ""] as const,
  details: () => [...noteKeys.all, "detail"] as const,
  detail: (noteId: string, userId?: string, userEmail?: string) =>
    [...noteKeys.details(), noteId, userId ?? "", userEmail ?? ""] as const,
  publicList: (sort: string, limit: number, offset: number) =>
    [...noteKeys.all, "public", sort, limit, offset] as const,
  pages: () => [...noteKeys.all, "pages"] as const,
  pageList: (noteId: string) => [...noteKeys.pages(), noteId] as const,
  page: (noteId: string, pageId: string) => [...noteKeys.pages(), noteId, pageId] as const,
  members: () => [...noteKeys.all, "members"] as const,
  memberList: (noteId: string) => [...noteKeys.members(), noteId] as const,
};

type NoteWithAccess = { note: Note; access: NoteAccess } | null;

function parseTs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function apiNoteToNote(item: {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: string;
  edit_permission?: string;
  is_official?: boolean;
  view_count?: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}): Note {
  return {
    id: item.id,
    ownerUserId: item.owner_id,
    title: item.title ?? "",
    visibility: item.visibility as Note["visibility"],
    editPermission: (item.edit_permission as Note["editPermission"]) ?? "owner_only",
    isOfficial: item.is_official ?? false,
    viewCount: item.view_count ?? 0,
    createdAt: parseTs(item.created_at),
    updatedAt: parseTs(item.updated_at),
    isDeleted: item.is_deleted,
  };
}

function apiNoteToNoteSummary(item: NoteListItem): import("@/types/note").NoteSummary {
  const role =
    item.role === "owner"
      ? ("owner" as const)
      : item.role === "editor"
        ? ("editor" as const)
        : ("viewer" as const);
  return {
    ...apiNoteToNote(item),
    role,
    pageCount: item.page_count ?? 0,
    memberCount: item.member_count ?? 0,
  };
}

/** Map Discover API item to NoteSummary for NoteCard. */
export function mapDiscoverItemToNoteSummary(
  item: DiscoverResponse["official"][0],
): import("@/types/note").NoteSummary {
  return {
    ...apiNoteToNote({ ...item, is_deleted: false }),
    role: "guest",
    pageCount: item.page_count ?? 0,
    memberCount: 0,
  };
}

function buildAccessFromApi(
  note: Note,
  currentUserRole: "owner" | "editor" | "viewer" | "guest",
  userId?: string,
): NoteAccess {
  const isOwner = currentUserRole === "owner";
  const isEditor = currentUserRole === "editor";
  const isViewer = currentUserRole === "viewer";
  const isGuest = currentUserRole === "guest";
  const canView = isOwner || isEditor || isViewer || isGuest;
  const canEdit = isOwner || isEditor;
  const canAddPage =
    canEdit || (note.editPermission === "any_logged_in" && canView && Boolean(userId));
  const canManageMembers = isOwner;
  const canDeletePage = (addedByUserId: string) => {
    if (isOwner) return true;
    if (isEditor && userId && addedByUserId === userId) return true;
    return false;
  };
  return {
    role: currentUserRole as NoteAccess["role"],
    visibility: note.visibility,
    editPermission: note.editPermission,
    canView,
    canEdit,
    canAddPage,
    canManageMembers,
    canDeletePage,
  };
}

function apiPageToPageSummary(p: GetNoteResponse["pages"][0]): PageSummary {
  return {
    id: p.id,
    ownerUserId: p.owner_id,
    title: p.title ?? "",
    contentPreview: p.content_preview ?? undefined,
    thumbnailUrl: p.thumbnail_url ?? undefined,
    sourceUrl: p.source_url ?? undefined,
    createdAt: parseTs(p.created_at),
    updatedAt: parseTs(p.updated_at),
    isDeleted: p.is_deleted,
  };
}

function apiPageToPage(p: GetNoteResponse["pages"][0]): Page {
  return {
    ...apiPageToPageSummary(p),
    content: "",
  };
}

function apiMemberToNoteMember(m: NoteMemberItem, noteId: string): NoteMember {
  return {
    noteId,
    memberEmail: m.member_email,
    role: (m.role === "editor" ? "editor" : "viewer") as NoteMemberRole,
    invitedByUserId: m.invited_by_user_id,
    createdAt: parseTs(m.created_at),
    updatedAt: parseTs(m.updated_at),
    isDeleted: false,
  };
}

/**
 * C3-9: Hook to get API client and auth for note queries (replaces useNoteRepository).
 */
export function useNoteApi() {
  const { getToken, isSignedIn, userId, isLoaded } = useAuth();
  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? undefined;

  const api = createApiClient({ getToken });

  return {
    api,
    userId: userId ?? "",
    userEmail,
    isSignedIn: isSignedIn ?? false,
    isLoaded: isLoaded ?? false,
  };
}

export function useNotes() {
  const { api, userId, userEmail, isLoaded, isSignedIn } = useNoteApi();

  const query = useQuery({
    queryKey: noteKeys.list(userId, userEmail),
    queryFn: async () => {
      const list = await api.getNotes();
      return list.map(apiNoteToNoteSummary);
    },
    enabled: isLoaded && isSignedIn,
    staleTime: 1000 * 60,
  });

  return {
    ...query,
    isLoading: query.isLoading || !isLoaded,
  };
}

type UseNoteOptions = { allowRemote?: boolean };

export function useNote(noteId: string, _options?: UseNoteOptions) {
  const { api, userId, userEmail, isLoaded, isSignedIn } = useNoteApi();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: noteKeys.detail(noteId, userId, userEmail),
    queryFn: async (): Promise<NoteWithAccess> => {
      const res = await api.getNote(noteId);
      const note = apiNoteToNote(res);
      const access = buildAccessFromApi(note, res.current_user_role, userId);
      return { note, access };
    },
    enabled: isLoaded && !!noteId,
  });

  const noteWithAccess = query.data ?? null;

  return {
    note: noteWithAccess?.note ?? null,
    access: noteWithAccess?.access ?? null,
    source: isSignedIn ? ("local" as const) : ("remote" as const),
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function usePublicNotes(sort: "updated" | "popular" = "updated", limit = 20, offset = 0) {
  const { api } = useNoteApi();
  return useQuery({
    queryKey: noteKeys.publicList(sort, limit, offset),
    queryFn: async (): Promise<DiscoverResponse> => {
      return api.getPublicNotes({ sort, limit, offset });
    },
    staleTime: 1000 * 60,
  });
}

export function useNotePages(
  noteId: string,
  _source?: "local" | "remote",
  enabled: boolean = true,
) {
  const { api, isLoaded, userId } = useNoteApi();

  return useQuery({
    queryKey: noteKeys.pageList(noteId),
    queryFn: async (): Promise<NotePageSummary[]> => {
      const res = await api.getNote(noteId);
      return res.pages.map((p) => ({
        ...apiPageToPageSummary(p),
        addedByUserId: p.added_by_user_id,
      }));
    },
    enabled: enabled && isLoaded && !!noteId,
  });
}

export function useNotePage(
  noteId: string,
  pageId: string,
  _source?: "local" | "remote",
  enabled: boolean = true,
) {
  const { api, isLoaded, isSignedIn } = useNoteApi();

  return useQuery({
    queryKey: noteKeys.page(noteId, pageId),
    queryFn: async (): Promise<Page | null> => {
      const res = await api.getNote(noteId);
      const p = res.pages.find((x) => x.id === pageId);
      return p ? apiPageToPage(p) : null;
    },
    enabled: enabled && isLoaded && isSignedIn && !!noteId && !!pageId,
  });
}

export function useNoteMembers(noteId: string, enabled: boolean = true) {
  const { api, isLoaded, isSignedIn } = useNoteApi();

  return useQuery({
    queryKey: noteKeys.memberList(noteId),
    queryFn: async (): Promise<NoteMember[]> => {
      const list = await api.getNoteMembers(noteId);
      return list.map((m) => apiMemberToNoteMember(m, noteId));
    },
    enabled: enabled && isLoaded && isSignedIn && !!noteId,
  });
}

export function useCreateNote() {
  const { api } = useNoteApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      title,
      visibility,
      editPermission,
    }: {
      title: string;
      visibility: Note["visibility"];
      editPermission?: Note["editPermission"];
    }) => {
      const created = await api.createNote({
        title,
        visibility,
        edit_permission: editPermission,
      });
      return apiNoteToNote(created);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

export function useUpdateNote() {
  const { api } = useNoteApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      updates,
    }: {
      noteId: string;
      updates: Partial<Pick<Note, "title" | "visibility" | "editPermission">>;
    }) => {
      await api.updateNote(noteId, {
        title: updates.title,
        visibility: updates.visibility,
        edit_permission: updates.editPermission,
      });
      return { noteId, updates };
    },
    onSuccess: ({ noteId, updates }) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
      if (updates.visibility === "private") {
        queryClient.invalidateQueries({ queryKey: noteKeys.memberList(noteId) });
      }
    },
  });
}

export function useDeleteNote() {
  const { api } = useNoteApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      await api.deleteNote(noteId);
      return noteId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

export function useAddPageToNote() {
  const { api } = useNoteApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      pageId,
      title,
    }: {
      noteId: string;
      pageId?: string;
      title?: string;
    }) => {
      await api.addNotePage(noteId, { pageId, title });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.pageList(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
    },
  });
}

export function useRemovePageFromNote() {
  const { api } = useNoteApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, pageId }: { noteId: string; pageId: string }) => {
      await api.removeNotePage(noteId, pageId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.pageList(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
    },
  });
}

export function useAddNoteMember() {
  const { api } = useNoteApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      memberEmail,
      role,
    }: {
      noteId: string;
      memberEmail: string;
      role: NoteMemberRole;
    }) => {
      await api.addNoteMember(noteId, { member_email: memberEmail, role });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.memberList(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
    },
  });
}

export function useUpdateNoteMemberRole() {
  const { api } = useNoteApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      memberEmail,
      role,
    }: {
      noteId: string;
      memberEmail: string;
      role: NoteMemberRole;
    }) => {
      await api.updateNoteMember(noteId, memberEmail, { role });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.memberList(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
    },
  });
}

export function useRemoveNoteMember() {
  const { api } = useNoteApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, memberEmail }: { noteId: string; memberEmail: string }) => {
      await api.removeNoteMember(noteId, memberEmail);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.memberList(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
    },
  });
}
