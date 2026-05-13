import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryFunctionContext,
} from "@tanstack/react-query";
import { useAuth, useUser } from "@/hooks/useAuth";
import { createApiClient } from "@/lib/api";
import type {
  NoteListItem,
  GetNoteResponse,
  NoteMemberItem,
  DiscoverResponse,
  CopyNotePageToPersonalResponse,
  NotePageWindowInclude,
  NotePageWindowItem,
  NotePageWindowResponse,
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
  /**
   * `noteId` 配下のすべての detail エントリ（任意の `userId` / `userEmail`）に
   * 一致するプレフィックスキー。`invalidateQueries` のターゲットとして使う。
   * Issue #848 で `useNotePages` を `useNote` と同じキーに統一した結果、
   * 旧 `pageList(noteId)` 無効化はこちらに置き換えられる。
   *
   * Prefix key matching every detail entry for `noteId` regardless of caller
   * `userId` / `userEmail`. Used as the `invalidateQueries` target after
   * mutations that change the page list. Issue #848 collapsed `useNotePages`
   * onto the same key as `useNote`, so the old `pageList(noteId)` invalidator
   * is replaced by this one.
   */
  detailsByNoteId: (noteId: string) => [...noteKeys.details(), noteId] as const,
  publicList: (sort: string, limit: number, offset: number) =>
    [...noteKeys.all, "public", sort, limit, offset] as const,
  pages: () => [...noteKeys.all, "pages"] as const,
  page: (noteId: string, pageId: string) => [...noteKeys.pages(), noteId, pageId] as const,
  /**
   * `useInfiniteNotePages` の queryKey ファクトリ。`useNote` 系の detail キーとは
   * 別系統で持ち、include トークンと pageSize までキーに含めることで、同一
   * ノートでも異なる include / pageSize で同居できるようにする（issue #860
   * Phase 3）。
   *
   * Query-key factory for `useInfiniteNotePages`. Kept separate from the
   * `useNote` detail key so the windowed list does not collide with the legacy
   * shell payload. `include` and `pageSize` are part of the key so different
   * call sites can co-exist without cross-contaminating cached pages
   * (issue #860 Phase 3).
   */
  pagesWindow: (
    noteId: string,
    userId: string,
    userEmail: string | undefined,
    include: ReadonlyArray<NotePageWindowInclude>,
    pageSize: number,
  ) =>
    [
      ...noteKeys.pages(),
      "window",
      noteId,
      userId,
      userEmail ?? "",
      [...include].sort().join(","),
      pageSize,
    ] as const,
  /**
   * `noteId` 配下のすべての window エントリ（任意の include / pageSize / 認証
   * プリンシパル）にマッチするプレフィックスキー。Mutation 後の
   * `invalidateQueries` ターゲットに使う。
   *
   * Prefix key matching every window entry for a note regardless of include
   * tokens, page size, or auth principal. Used as the invalidation target
   * after mutations that change the note's page list.
   */
  pagesWindowByNoteId: (noteId: string) => [...noteKeys.pages(), "window", noteId] as const,
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
 * `useNote` / `useNotePages` が `GET /api/notes/:id` を叩く際に再利用する
 * 直近 ETag を覚えておくモジュールスコープのキャッシュ（Issue #853）。
 * 認証プリンシパルでキーを分けているのは、同じ noteId でもロールが
 * 変われば ETag も変わるため。React Query 本体のキャッシュとは別に持つ
 * 理由は、queryFn の中から軽量に参照したい + 304 時のフォールバックを
 * シンプルにするため。
 *
 * Map の挿入順保証を利用した LRU バウンディングで、長時間セッションでも
 * 際限なくエントリが積み上がらないようにする（上限を超えたら最古を捨てる、
 * PR #856 Gemini medium review）。
 *
 * Module-scoped cache for the most-recent ETag seen for each
 * `GET /api/notes/:id` request (Issue #853). Keyed by note id + auth
 * principal so a role change invalidates the cached validator. Kept
 * separate from React Query's query cache so the `queryFn` can both read
 * and write without going through the (potentially stale) query data
 * snapshot, and so the 304 fallback path stays straightforward.
 *
 * Bounded via LRU eviction (using `Map`'s insertion-order guarantee) so a
 * long browsing session does not accumulate unbounded entries (PR #856
 * Gemini medium review).
 */
const NOTE_ETAG_CACHE_MAX_ENTRIES = 64;
const noteEtagCache = new Map<string, string>();

function noteEtagKey(noteId: string, userId: string, userEmail: string | undefined): string {
  return `${noteId}:${userId}:${userEmail ?? ""}`;
}

/** LRU read: bump the entry to most-recently-used by re-inserting it. */
function noteEtagCacheGet(key: string): string | undefined {
  const value = noteEtagCache.get(key);
  if (value === undefined) return undefined;
  noteEtagCache.delete(key);
  noteEtagCache.set(key, value);
  return value;
}

/** LRU write: insert as most-recently-used, evict oldest if over capacity. */
function noteEtagCacheSet(key: string, value: string): void {
  if (noteEtagCache.has(key)) noteEtagCache.delete(key);
  noteEtagCache.set(key, value);
  if (noteEtagCache.size > NOTE_ETAG_CACHE_MAX_ENTRIES) {
    const oldest = noteEtagCache.keys().next().value;
    if (oldest !== undefined) noteEtagCache.delete(oldest);
  }
}

/** Test-only helper. ETag キャッシュをクリアする。 */
export function __resetNoteEtagCacheForTesting(): void {
  noteEtagCache.clear();
}

/**
 * `useNote` / `useNotePages` の共通 queryFn ファクトリ。
 * `If-None-Match` を載せて `getNoteWithCache` を呼び、304 が返れば
 * React Query キャッシュ上の前回レスポンスをそのまま返す。
 *
 * Shared `queryFn` factory for `useNote` / `useNotePages`. Sends
 * `If-None-Match` and, on a 304 response, returns the previously cached
 * `GetNoteResponse` straight from the React Query cache so consumers see
 * the same object reference (skipping unnecessary `select` re-runs).
 */
function makeNoteQueryFn(
  noteId: string,
  api: ReturnType<typeof createApiClient>,
  userId: string,
  userEmail: string | undefined,
) {
  return async (ctx: QueryFunctionContext<readonly unknown[]>): Promise<GetNoteResponse> => {
    const etagKey = noteEtagKey(noteId, userId, userEmail);
    const ifNoneMatch = noteEtagCacheGet(etagKey);
    const result = await api.getNoteWithCache(noteId, { ifNoneMatch });

    if (result.notModified) {
      const cached = ctx.client.getQueryData<GetNoteResponse>(ctx.queryKey);
      if (cached) return cached;
      // 304 だがローカルキャッシュが消えている場合（タブ間で QueryCache が
      // 別、永続化されていない、等）はサーバ側 ETag だけ拾って再フェッチする。
      // 304 without a local cache (e.g. fresh tab, no persistence) — refetch
      // unconditionally to recover.
      const fresh = await api.getNoteWithCache(noteId);
      if (fresh.etag) noteEtagCacheSet(etagKey, fresh.etag);
      if (!fresh.data) {
        throw new Error("Server returned 304 twice without a cached body");
      }
      return fresh.data;
    }

    if (result.etag) noteEtagCacheSet(etagKey, result.etag);
    if (!result.data) {
      throw new Error("Unexpected null body on 200 response from /api/notes/:id");
    }
    return result.data;
  };
}

/**
 * `useNote` / `useNotePages` 共通の `placeholderData` ファクトリ。
 * `noteId` をまたぐ遷移では前ノートの結果を残して白画面を回避するが、
 * 認証コンテキスト (`userId` / `userEmail`) が変化する遷移
 * （ログアウト・別アカウントへの切替）では前ユーザーのデータを残さない
 * よう `undefined` を返す。Issue #855 review (Codex P1)。
 *
 * Shared `placeholderData` factory for `useNote` and `useNotePages`. The
 * previous result is preserved across `noteId` transitions to avoid the
 * blank loading state, but it is discarded when the auth principal
 * (`userId` / `userEmail`) changes (sign-out, account switch) so a private
 * note that becomes inaccessible stops rendering the previous user's data
 * mid-transition.
 */
function notePlaceholderDataIfSamePrincipal(userId: string, userEmail: string | undefined) {
  const currentEmail = userEmail ?? "";
  return (
    previousData: GetNoteResponse | undefined,
    previousQuery?: { queryKey: readonly unknown[] },
  ): GetNoteResponse | undefined => {
    if (!previousData || !previousQuery) return undefined;
    const key = previousQuery.queryKey;
    // `noteKeys.detail(noteId, userId, userEmail)` produces
    // [..., noteId, userId, userEmail]; the principal lives in the last two
    // slots regardless of any future prefix changes.
    if (key.length < 2) return undefined;
    const prevUserId = key[key.length - 2];
    const prevUserEmail = key[key.length - 1];
    return prevUserId === userId && prevUserEmail === currentEmail ? previousData : undefined;
  };
}

/**
 * 単一の Note とアクセス権情報を取得するフック。
 * Hook that fetches a single Note alongside the caller's access context.
 *
 * `useNotePages` と同じ `queryKey` / `queryFn` を共有し、`select` で
 * `{ note, access }` を導出する。これにより `GET /api/notes/:id` の
 * 重複フェッチが回避される（Issue #848）。
 *
 * Shares the `queryKey` / `queryFn` with `useNotePages` and derives
 * `{ note, access }` via `select`. This dedupes `GET /api/notes/:id` so the
 * heavy JSON is fetched only once per note (Issue #848).
 */
export function useNote(noteId: string, _options?: UseNoteOptions) {
  const { api, userId, userEmail, isLoaded, isSignedIn } = useNoteApi();

  const query = useQuery({
    queryKey: noteKeys.detail(noteId, userId, userEmail),
    queryFn: makeNoteQueryFn(noteId, api, userId, userEmail),
    enabled: isLoaded && !!noteId,
    // 別ノートへ遷移しても前ノートのデータを残し、白画面を回避する。ただし
    // ログアウト・アカウント切替時に前ユーザーのデータを引き継がないよう、
    // `userId` / `userEmail` が同一の場合に限って placeholder を返す。
    //
    // Keep showing the previous note while fetching the next one to avoid the
    // blank loading state, gated on a matching auth principal so logout /
    // account switches do not carry the previous user's data forward.
    placeholderData: notePlaceholderDataIfSamePrincipal(userId, userEmail),
    select: (res): NoteWithAccess => {
      const note = apiNoteToNote(res);
      const access = buildAccessFromApi(note, res.current_user_role, userId);
      return { note, access };
    },
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
 *
 * `useNote` と同じ `queryKey` / `queryFn` を使い、`select` でページ配列のみを
 * 切り出す。React Query が同一キーでフェッチをディデュープするので、
 * `useNote` と同居しても `GET /api/notes/:id` は 1 回しか走らない
 * （Issue #848）。
 *
 * Hook that fetches pages belonging to the given note for the note view.
 * Reuses the `queryKey` / `queryFn` of `useNote` and extracts the pages slice
 * through `select`, so co-locating both hooks yields a single
 * `GET /api/notes/:id` round trip (Issue #848).
 */
export function useNotePages(
  noteId: string,
  _source?: "local" | "remote",
  enabled: boolean = true,
) {
  const { api, userId, userEmail, isLoaded } = useNoteApi();

  return useQuery({
    queryKey: noteKeys.detail(noteId, userId, userEmail),
    queryFn: makeNoteQueryFn(noteId, api, userId, userEmail),
    enabled: enabled && isLoaded && !!noteId,
    placeholderData: notePlaceholderDataIfSamePrincipal(userId, userEmail),
    // Issue #823 以降、ページは 1 つのノートにのみ所属し、API レスポンスは
    // 旧 `note_pages` の `added_by_user_id` を返さない。ページのオーナーが
    // 実質「ページを追加した人」なので `owner_id` を採用する（Issue #855
    // review fix; gemini-code-assist HIGH）。
    //
    // Since #823 every page lives in exactly one note and the API stopped
    // returning the legacy `note_pages.added_by_user_id`. The page owner is
    // effectively the adder, so we surface `owner_id` here. Fixes the
    // gemini-code-assist HIGH finding on PR #855.
    select: (res): NotePageSummary[] =>
      res.pages.map((p) => ({
        ...apiPageToPageSummary(p),
        addedByUserId: p.owner_id,
      })),
  });
}

/**
 * `useInfiniteNotePages` のデフォルト 1 ページサイズ（issue #860 Phase 3）。
 * サーバ側上限 ({@link MAX_PAGES_LIMIT}) と整合させる。
 *
 * Default page size for `useInfiniteNotePages` (issue #860 Phase 3). Aligned
 * with the server-side cap defined in
 * `server/api/src/routes/notes/pages.ts` (`MAX_PAGES_LIMIT = 100`).
 */
export const DEFAULT_INFINITE_NOTE_PAGES_SIZE = 50;

/**
 * `useInfiniteNotePages` のデフォルト include。一覧カード描画には preview と
 * thumbnail が必要なため、両方とも要求する。
 *
 * Default `include` set for `useInfiniteNotePages`. The grid cards render the
 * head preview and the thumbnail, so both extras are requested.
 */
const DEFAULT_INFINITE_NOTE_PAGES_INCLUDE: ReadonlyArray<NotePageWindowInclude> = [
  "preview",
  "thumbnail",
];

/**
 * `useInfiniteNotePages` のオプション。
 *
 * Options for {@link useInfiniteNotePages}.
 */
export interface UseInfiniteNotePagesOptions {
  /**
   * 取得する追加フィールド。デフォルトでは `preview` と `thumbnail` の両方を
   * 要求する。サーバは未指定トークンを無視するため、将来追加された値も後方
   * 互換に渡せる。
   *
   * Optional extra fields to request via `?include=`. Defaults to both
   * `preview` and `thumbnail`. The server silently drops unknown tokens, so
   * passing future values stays backward compatible.
   */
  include?: ReadonlyArray<NotePageWindowInclude>;
  /**
   * 1 ページあたりの取得件数（1..100）。省略時は {@link DEFAULT_INFINITE_NOTE_PAGES_SIZE}。
   *
   * Items per request (1..100). Defaults to
   * {@link DEFAULT_INFINITE_NOTE_PAGES_SIZE}.
   */
  pageSize?: number;
  /**
   * 取得を抑止するゲート。`noteId` がまだ確定していない、もしくは権限判定が
   * 終わるまで遅らせたい呼び出し側で使う。
   *
   * Gate to suppress fetching, e.g. while `noteId` is still being resolved or
   * before the caller has confirmed view permission.
   */
  enabled?: boolean;
}

/** ISO 文字列 → ms 整数。パースできなければ 0 を返す。 */
function notePageWindowItemToSummary(p: NotePageWindowItem): NotePageSummary {
  return {
    id: p.id,
    ownerUserId: p.owner_id,
    noteId: p.note_id,
    title: p.title ?? "",
    contentPreview: p.content_preview ?? undefined,
    thumbnailUrl: p.thumbnail_url ?? undefined,
    sourceUrl: p.source_url ?? undefined,
    createdAt: parseTs(p.created_at),
    updatedAt: parseTs(p.updated_at),
    isDeleted: p.is_deleted,
    // issue #823 以降「ページを追加した人」 ≒ ページの owner。
    // After issue #823 the page owner is effectively the "adder", so reuse
    // `owner_id` to keep the `addedByUserId` slot populated for delete-guard UX.
    addedByUserId: p.owner_id,
  };
}

/**
 * ノート配下のページ一覧を keyset cursor pagination で段階取得するフック
 * （issue #860 Phase 3）。サーバの `GET /api/notes/:noteId/pages` 経路に
 * 対応し、`fetchNextPage()` で `next_cursor` を辿る。React Query の
 * `useInfiniteQuery` を使うので、UI 側は仮想スクロールの末尾検知から
 * 続きを要求するだけで済む。
 *
 * 戻り値の `pages` は全 window をフラット化した {@link NotePageSummary} 配列
 * （サーバ順 `updated_at DESC, id DESC` を維持）。`hasNextPage` /
 * `isFetchingNextPage` は仮想スクロール側で「これ以上要求しない」「重複呼び
 * 出しを抑止する」ためにそのまま使う。
 *
 * Step-paginated infinite query for a note's page list (issue #860 Phase 3).
 * Wraps `GET /api/notes/:noteId/pages` and threads the opaque `next_cursor`
 * back into the next request via `useInfiniteQuery`. UI consumers can flip
 * the `pages` array directly into a virtualized list and trigger
 * `fetchNextPage()` when the visible window approaches the tail.
 *
 * Returned `pages` is the flattened, server-ordered (`updated_at DESC,
 * id DESC`) array of {@link NotePageSummary}. `hasNextPage` /
 * `isFetchingNextPage` are surfaced so the caller can debounce repeated
 * tail-trigger fetches.
 */
export function useInfiniteNotePages(noteId: string, options: UseInfiniteNotePagesOptions = {}) {
  const { api, userId, userEmail, isLoaded } = useNoteApi();
  const include = options.include ?? DEFAULT_INFINITE_NOTE_PAGES_INCLUDE;
  const pageSize = options.pageSize ?? DEFAULT_INFINITE_NOTE_PAGES_SIZE;
  const enabled = (options.enabled ?? true) && isLoaded && !!noteId;

  const query = useInfiniteQuery<
    NotePageWindowResponse,
    Error,
    InfiniteData<NotePageWindowResponse, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: noteKeys.pagesWindow(noteId, userId, userEmail, include, pageSize),
    queryFn: async (ctx): Promise<NotePageWindowResponse> => {
      const cursor = ctx.pageParam ?? null;
      return api.getNotePages(noteId, {
        cursor,
        limit: pageSize,
        include,
      });
    },
    enabled,
    // 先頭リクエストは cursor 無し。サーバが `next_cursor: null` を返したら
    // `getNextPageParam` は `undefined` を返して infinite query が終端を認識する。
    // First request has no cursor; once the server returns `next_cursor: null`
    // we report `undefined` to mark the end of the list to React Query.
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  // `select` を使わずに導出してメモ化する。`useInfiniteQuery` の `select` は
  // 各 page を変換するか、全体を変換するか型が複雑になりやすいので、
  // ここでは導出値だけ `useMemo` で計算する。
  // Derive the flattened summary list outside `select` to keep the generic
  // types simple; `useInfiniteQuery` re-runs the selector on every cache
  // update, so wrapping the work in `useMemo` keeps render churn bounded.
  const flattened = useMemo<NotePageSummary[]>(() => {
    if (!query.data) return [];
    const out: NotePageSummary[] = [];
    for (const window of query.data.pages) {
      for (const item of window.items) {
        out.push(notePageWindowItemToSummary(item));
      }
    }
    return out;
  }, [query.data]);

  return {
    /** Flattened, server-ordered page summaries across all fetched windows. */
    pages: flattened,
    /** Raw infinite-query pages, exposed for advanced callers that need cursor state. */
    rawPages: query.data?.pages ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    error: query.error,
  };
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
      queryClient.invalidateQueries({ queryKey: noteKeys.detailsByNoteId(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
      // issue #860 Phase 3: 新規ページは window の先頭に来るので、すべての
      // include / pageSize 組合せをまとめて再フェッチさせる。
      // Issue #860 Phase 3: invalidate every windowed cache for this note so
      // the newly created page shows up at the top regardless of include /
      // pageSize variant.
      queryClient.invalidateQueries({ queryKey: noteKeys.pagesWindowByNoteId(variables.noteId) });
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
      queryClient.invalidateQueries({ queryKey: noteKeys.detailsByNoteId(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
      // issue #860 Phase 3: window 経路の infinite cache も合わせて更新。
      // Issue #860 Phase 3: also refresh the windowed infinite cache.
      queryClient.invalidateQueries({ queryKey: noteKeys.pagesWindowByNoteId(variables.noteId) });
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
      queryClient.invalidateQueries({ queryKey: noteKeys.detailsByNoteId(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
      // issue #860 Phase 3: 削除後の window を再フェッチする。
      // Issue #860 Phase 3: refresh the windowed infinite cache after deletion.
      queryClient.invalidateQueries({ queryKey: noteKeys.pagesWindowByNoteId(variables.noteId) });
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
