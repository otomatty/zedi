import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useUser } from "@/hooks/useAuth";
import { createApiClient } from "@/lib/api";
import type {
  NoteListItem,
  GetNoteResponse,
  NoteMemberItem,
  DiscoverResponse,
  CopyNotePageToPersonalResponse,
} from "@/lib/api/types";
import type { Note, NoteAccess, NoteMember, NoteMemberRole } from "@/types/note";
import type { Page, PageSummary } from "@/types/page";
import { pageKeys, useRepository } from "@/hooks/usePageQueries";

/** Page in a note with who added it (for canDeletePage). */
export type NotePageSummary = PageSummary & { addedByUserId: string };

/**
 * Note 関連クエリ・ミューテーションで共有する React Query キー群。
 * React Query key factory shared by note-related queries and mutations.
 */
export const noteKeys = {
  all: ["notes"] as const,
  lists: () => [...noteKeys.all, "list"] as const,
  list: (userId: string, userEmail?: string) =>
    [...noteKeys.lists(), userId, userEmail ?? ""] as const,
  /**
   * `GET /api/notes/me` のキー。`/notes/me` ランディングがデフォルトノート ID を
   * 解決する際に使う（issue #825）。userId 単位でキャッシュし、別アカウントへの
   * 切り替え時は別キーになるようにする。
   *
   * Cache key for `GET /api/notes/me`. Used by the `/notes/me` landing page to
   * resolve the default note id (issue #825). Keyed per `userId` so account
   * switches do not bleed cache.
   */
  myNote: (userId: string) => [...noteKeys.all, "me", userId] as const,
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
  is_default?: boolean;
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
    isDefault: item.is_default ?? false,
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
    // Issue #823 でデフォルトノートが導入され、ページは必ずいずれかのノートに
    // 所属するようになったため `note_id` は常に非 null（issue #825 で
    // フロント型も non-null に揃えた）。
    // After issue #823 every page belongs to exactly one note, so `note_id`
    // is always present (issue #825 also tightened the frontend type).
    noteId: p.note_id,
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
  const invitation = m.invitation
    ? {
        expiresAt: parseTs(m.invitation.expiresAt),
        lastEmailSentAt: m.invitation.lastEmailSentAt
          ? parseTs(m.invitation.lastEmailSentAt)
          : null,
        emailSendCount: m.invitation.emailSendCount,
      }
    : null;
  return {
    noteId,
    memberEmail: m.member_email,
    role: (m.role === "editor" ? "editor" : "viewer") as NoteMemberRole,
    status: m.status ?? "pending",
    invitedByUserId: m.invited_by_user_id,
    createdAt: parseTs(m.created_at),
    updatedAt: parseTs(m.updated_at),
    isDeleted: false,
    invitation,
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

/**
 * 認証済みユーザーが所属する全 Note のサマリ一覧を取得するフック。
 * React Query hook that fetches the current user's note summaries.
 */
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

/**
 * デフォルトノート解決 hook の実行オプション。
 *
 * Runtime options for the default-note resolver hook.
 */
export interface UseMyNoteOptions {
  /**
   * クエリ実行を追加で制御する。オンボーディング中など、副作用のある
   * default note 解決を遅らせたい画面で利用する。
   *
   * Additional query gate for screens that need to defer the side-effecting
   * default-note resolution, such as the setup wizard redirect path.
   */
  enabled?: boolean;
}

/**
 * デフォルトノート（マイノート）の ID を解決するフック。`GET /api/notes/me`
 * を呼び、未作成ならサーバ側で idempotent に作成された ID を受け取る。
 * `/notes/me` ランディング（`NoteMeRedirect`）がこの hook を使ってリダイレクト
 * 先の `noteId` を決める。Issue #825。
 *
 * Resolves the caller's default note ("マイノート") id. Hits
 * `GET /api/notes/me`, which idempotently creates one when missing. The
 * `/notes/me` landing page (`NoteMeRedirect`) consumes the resolved `noteId`
 * to issue the single-step redirect to `/notes/:noteId`. Issue #825.
 */
export function useMyNote(options: UseMyNoteOptions = {}) {
  const { api, userId, isLoaded, isSignedIn } = useNoteApi();
  const shouldResolve = options.enabled ?? true;

  const query = useQuery({
    queryKey: noteKeys.myNote(userId),
    queryFn: () => api.getMyNote(),
    // 認証必須: 未ログインで叩くと 401 が返るため、サインイン後にのみ実行する。
    // Auth-only: the endpoint returns 401 for guests, so gate on `isSignedIn`.
    enabled: isLoaded && isSignedIn && shouldResolve,
    // ID は同一セッションでは変わらないため、再取得頻度を低く保つ。
    // The id is stable for the session, so keep refetches conservative.
    staleTime: 1000 * 60 * 5,
  });

  return query;
}

type UseNoteOptions = { allowRemote?: boolean };

/**
 * 単一の Note とアクセス権情報を取得するフック。
 * Hook that fetches a single Note alongside the caller's access context.
 */
export function useNote(noteId: string, _options?: UseNoteOptions) {
  const { api, userId, userEmail, isLoaded, isSignedIn } = useNoteApi();

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

/**
 * 公開ノートの発見（Discover）向け一覧を取得するフック。
 * Hook that fetches the public Discover listing of notes.
 */
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

/**
 * 指定ノートに含まれるページ一覧（ノート画面用）を取得するフック。
 * Hook that fetches pages belonging to the given note for the note view.
 */
export function useNotePages(
  noteId: string,
  _source?: "local" | "remote",
  enabled: boolean = true,
) {
  const { api, isLoaded } = useNoteApi();

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

/**
 * ノート内の単一ページ（noteId + pageId）を取得するフック。
 * Hook that fetches a single page within a note by noteId + pageId.
 */
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

/**
 * ノートの招待済み・参加中メンバー一覧を取得するフック。
 * Hook that fetches invited / joined members of a note.
 */
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

/**
 * 新規ノート作成のミューテーションフック。成功時にノート系キャッシュを無効化する。
 * Mutation hook for creating a new note; invalidates note caches on success.
 */
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

/**
 * ノートの title / visibility / editPermission を更新するミューテーションフック。
 * Mutation hook for updating a note's title / visibility / editPermission.
 */
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

/**
 * ノートを削除するミューテーションフック。
 * Mutation hook for deleting a note.
 */
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

/**
 * ノートにページを追加するミューテーションフック（既存ページの参照またはタイトル指定作成）。
 * Mutation hook for attaching a page to a note (reference or title-based create).
 */
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

/**
 * 個人ページをコピーしてノートネイティブページを作るミューテーションフック (issue #713 Phase 3)。
 * 元の個人ページは `/home` に残り、新しいコピーだけがノートに出る。
 *
 * Mutation hook that copies a personal page into a note as a fresh
 * note-native page. The original stays on `/home`; only the copy surfaces
 * inside the note. See issue #713 Phase 3.
 */
export function useCopyPersonalPageToNote() {
  const { api } = useNoteApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, sourcePageId }: { noteId: string; sourcePageId: string }) => {
      return api.copyPersonalPageToNote(noteId, sourcePageId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.pageList(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
    },
  });
}

/**
 * ノートネイティブページをコピーして個人ページにするミューテーションフック (issue #713 Phase 3)。
 * 元のノートページはノートに残り、コピーだけが呼び出し元の `/home` に加わる。
 *
 * Mutation hook that copies a note-native page into the caller's personal
 * pages. The source stays in the note; only the copy lands on `/home`.
 * See issue #713 Phase 3.
 */
export function useCopyNotePageToPersonal() {
  const { api, userId } = useNoteApi();
  const { getRepository } = useRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      sourcePageId,
    }: {
      noteId: string;
      sourcePageId: string;
    }): Promise<CopyNotePageToPersonalResponse & { localImported: boolean }> => {
      const result = await api.copyNotePageToPersonal(noteId, sourcePageId);
      // Codex P1 対応: `/home` は IndexedDB を直接読む（React Query の裏に adapter
      // がいる）ので、単にキャッシュ無効化しても新ページは現れない。サーバーが
      // 返した `result.page`（SyncPageItem）を IDB に書き戻し、その成否を
      // `localImported` フラグで呼び出し側に返す。失敗は non-fatal（次回 sync で
      // 拾われる）だが、呼び出し側が「いま開く」のような即時遷移 CTA を出すか
      // どうかをこのフラグで切り替えられる。
      //
      // `/home` reads directly from IndexedDB via the storage adapter, so
      // invalidating React Query alone would just re-read stale IDB. Write the
      // server response through to IDB and report whether it stuck, so callers
      // can gate an immediate-navigation CTA (e.g. toast "Open") on local
      // success. A write-through miss is non-fatal — the next sync pass will
      // still reconcile `/home` — but the UI should not promise an instant
      // jump to a page the local store does not yet have.
      // (Issue #713 Phase 3, Codex P1 / CodeRabbit follow-up.)
      let localImported = false;
      try {
        const repo = await getRepository();
        const imported = await repo.importPersonalPageFromApi(result.page);
        if (imported) {
          localImported = true;
        } else {
          // `importPersonalPageFromApi` は個人ページ（`note_id: null`）以外を
          // 防御的に拒否して `null` を返す。通常ルートでは copy-to-personal の
          // サーバー応答は必ず個人ページなのでここを通らないが、契約ドリフト
          // （例: サーバーが誤って `note_id` を埋めた）を早期に検知できるよう
          // 警告を残す。成功扱いは維持し、UI は `localImported` で分岐する。
          //
          // Defensive guard: the helper returns `null` for non-personal rows.
          // In a healthy flow this never fires — logged as a contract canary.
          console.warn(
            "[useCopyNotePageToPersonal] Server returned a non-personal page; skipped IDB write-through:",
            result.page,
          );
        }
      } catch (error) {
        console.warn(
          "[useCopyNotePageToPersonal] Failed to write copied page to IndexedDB:",
          error,
        );
      }
      return { ...result, localImported };
    },
    onSuccess: () => {
      // 書き戻しが終わってから無効化するので、`usePagesSummary` などの再取得で
      // 新ページが確実に並ぶ（ネットワーク状況に依存しない即時反映）。
      // We invalidate after the write-through, so any refetch from
      // `usePagesSummary` etc. picks up the new row deterministically.
      if (userId) {
        queryClient.invalidateQueries({ queryKey: pageKeys.list(userId) });
        queryClient.invalidateQueries({ queryKey: pageKeys.summary(userId) });
        queryClient.invalidateQueries({ queryKey: pageKeys.byTitles(userId) });
      } else {
        queryClient.invalidateQueries({ queryKey: pageKeys.all });
      }
    },
  });
}

/**
 * ノートからページを外すミューテーションフック。
 * Mutation hook for detaching a page from a note.
 */
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

/**
 * ノートにメンバー（viewer / editor）を招待するミューテーションフック。
 * Mutation hook for inviting a member (viewer / editor) to a note.
 */
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

/**
 * 既存メンバーのロールを viewer ↔ editor で更新するミューテーションフック。
 * Mutation hook for updating an existing member's role (viewer ↔ editor).
 */
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

/**
 * ノートからメンバーを外す（招待取り消し／強制脱退）ミューテーションフック。
 * Mutation hook for removing a member from a note (revoke invite / kick).
 */
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

/**
 * 招待メールを再送信する Mutation hook。
 * Mutation hook for resending an invitation email.
 */
export function useResendInvitation() {
  const { api } = useNoteApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, memberEmail }: { noteId: string; memberEmail: string }) => {
      return api.resendInvitation(noteId, memberEmail);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.memberList(variables.noteId) });
    },
  });
}
