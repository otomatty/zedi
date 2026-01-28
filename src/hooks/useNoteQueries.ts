import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useUser } from "@/hooks/useAuth";
import { useCallback, useEffect, useState } from "react";
import { getLocalClient, saveLocalDatabase } from "@/lib/turso";
import { NoteRepository } from "@/lib/noteRepository";
import type { Note, NoteAccess, NoteMember, NoteMemberRole } from "@/types/note";
import type { Page, PageSummary } from "@/types/page";
import { useTurso } from "@/hooks/useTurso";

const LOCAL_USER_ID = "local-user";

export const noteKeys = {
  all: ["notes"] as const,
  lists: () => [...noteKeys.all, "list"] as const,
  list: (userId: string, userEmail?: string) =>
    [...noteKeys.lists(), userId, userEmail ?? ""] as const,
  details: () => [...noteKeys.all, "detail"] as const,
  detail: (noteId: string, userId?: string, userEmail?: string) =>
    [...noteKeys.details(), noteId, userId ?? "", userEmail ?? ""] as const,
  pages: () => [...noteKeys.all, "pages"] as const,
  pageList: (noteId: string) => [...noteKeys.pages(), noteId] as const,
  page: (noteId: string, pageId: string) =>
    [...noteKeys.pages(), noteId, pageId] as const,
  members: () => [...noteKeys.all, "members"] as const,
  memberList: (noteId: string) => [...noteKeys.members(), noteId] as const,
  remote: () => [...noteKeys.all, "remote"] as const,
  remoteDetail: (noteId: string, userId?: string, userEmail?: string) =>
    [...noteKeys.remote(), noteId, userId ?? "", userEmail ?? ""] as const,
  remotePageList: (noteId: string) =>
    [...noteKeys.remote(), "pages", noteId] as const,
  remotePage: (noteId: string, pageId: string) =>
    [...noteKeys.remote(), "pages", noteId, pageId] as const,
};

type NoteWithAccess = { note: Note; access: NoteAccess } | null;

export function useNoteRepository() {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const { user } = useUser();
  const [isLocalDbReady, setIsLocalDbReady] = useState(false);

  const effectiveUserId = isSignedIn && userId ? userId : LOCAL_USER_ID;
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? undefined;

  useEffect(() => {
    let isMounted = true;
    getLocalClient(effectiveUserId)
      .then(() => {
        if (isMounted) setIsLocalDbReady(true);
      })
      .catch((error) => {
        console.error("Failed to initialize local database:", error);
        if (isMounted) setIsLocalDbReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveUserId]);

  const getRepository = useCallback(async (): Promise<NoteRepository> => {
    const client = await getLocalClient(effectiveUserId);
    return new NoteRepository(client, { onMutate: saveLocalDatabase });
  }, [effectiveUserId]);

  return {
    getRepository,
    userId: effectiveUserId,
    userEmail,
    isSignedIn: isSignedIn ?? false,
    isLoaded: isLoaded && isLocalDbReady,
  };
}

export function useNotes() {
  const { getRepository, userId, userEmail, isLoaded } = useNoteRepository();

  const query = useQuery({
    queryKey: noteKeys.list(userId, userEmail),
    queryFn: async () => {
      const repo = await getRepository();
      return repo.getNotesSummary(userId, userEmail);
    },
    enabled: isLoaded,
    staleTime: 1000 * 60,
  });

  return {
    ...query,
    isLoading: query.isLoading || !isLoaded,
  };
}

type UseNoteOptions = {
  allowRemote?: boolean;
};

export function useNote(noteId: string, options?: UseNoteOptions) {
  const { getRepository, userId, userEmail, isLoaded } = useNoteRepository();
  const { getClient, isLoaded: isTursoLoaded } = useTurso();
  const allowRemote = options?.allowRemote ?? true;
  const queryClient = useQueryClient();

  const localQuery = useQuery({
    queryKey: noteKeys.detail(noteId, userId, userEmail),
    queryFn: async (): Promise<NoteWithAccess> => {
      const repo = await getRepository();
      return repo.getNoteWithAccess(noteId, userId, userEmail);
    },
    enabled: isLoaded && !!noteId,
  });

  const shouldFetchRemote =
    allowRemote && !!noteId && !localQuery.isLoading && !localQuery.data;

  const remoteQuery = useQuery({
    queryKey: noteKeys.remoteDetail(noteId, userId, userEmail),
    queryFn: async (): Promise<NoteWithAccess> => {
      const client = await getClient();
      const repo = new NoteRepository(client);
      return repo.getNoteWithAccess(noteId, userId, userEmail);
    },
    enabled: shouldFetchRemote && isTursoLoaded,
  });

  const noteWithAccess = localQuery.data ?? remoteQuery.data ?? null;
  const source: "local" | "remote" = localQuery.data ? "local" : remoteQuery.data ? "remote" : "local";

  useEffect(() => {
    if (!noteId || source !== "local" || !noteWithAccess) return;
    if (!userId || !userEmail) return;
    if (noteWithAccess.note.ownerUserId !== userId) return;

    let isCancelled = false;

    const ensureOwnerMember = async () => {
      const repo = await getRepository();
      const updated = await repo.ensureOwnerMember(noteId, userId, userEmail);
      if (updated && !isCancelled) {
        queryClient.invalidateQueries({
          queryKey: noteKeys.memberList(noteId),
        });
        queryClient.invalidateQueries({ queryKey: noteKeys.all });
      }
    };

    ensureOwnerMember().catch((error) => {
      console.error("Failed to ensure owner member:", error);
    });

    return () => {
      isCancelled = true;
    };
  }, [
    noteId,
    source,
    noteWithAccess,
    userId,
    userEmail,
    getRepository,
    queryClient,
  ]);

  return {
    note: noteWithAccess?.note ?? null,
    access: noteWithAccess?.access ?? null,
    source,
    isLoading:
      localQuery.isLoading ||
      (!localQuery.data && shouldFetchRemote && remoteQuery.isLoading),
    error: localQuery.error ?? remoteQuery.error,
  };
}

export function useNotePages(
  noteId: string,
  source: "local" | "remote" = "local",
  enabled: boolean = true
) {
  const { getRepository, isLoaded } = useNoteRepository();
  const { getClient, isLoaded: isTursoLoaded } = useTurso();

  const isRemote = source === "remote";
  const isEnabled = enabled && !!noteId && (isRemote ? isTursoLoaded : isLoaded);

  return useQuery({
    queryKey: isRemote ? noteKeys.remotePageList(noteId) : noteKeys.pageList(noteId),
    queryFn: async (): Promise<PageSummary[]> => {
      if (isRemote) {
        const client = await getClient();
        const repo = new NoteRepository(client);
        return repo.getNotePagesSummary(noteId);
      }
      const repo = await getRepository();
      return repo.getNotePagesSummary(noteId);
    },
    enabled: isEnabled,
  });
}

export function useNotePage(
  noteId: string,
  pageId: string,
  source: "local" | "remote" = "local",
  enabled: boolean = true
) {
  const { getRepository, isLoaded } = useNoteRepository();
  const { getClient, isLoaded: isTursoLoaded } = useTurso();
  const isRemote = source === "remote";
  const isEnabled =
    enabled && !!noteId && !!pageId && (isRemote ? isTursoLoaded : isLoaded);

  return useQuery({
    queryKey: isRemote
      ? noteKeys.remotePage(noteId, pageId)
      : noteKeys.page(noteId, pageId),
    queryFn: async (): Promise<Page | null> => {
      if (isRemote) {
        const client = await getClient();
        const repo = new NoteRepository(client);
        return repo.getNotePage(noteId, pageId);
      }
      const repo = await getRepository();
      return repo.getNotePage(noteId, pageId);
    },
    enabled: isEnabled,
  });
}

export function useNoteMembers(noteId: string, enabled: boolean = true) {
  const { getRepository, isLoaded } = useNoteRepository();
  const isEnabled = enabled && isLoaded && !!noteId;

  return useQuery({
    queryKey: noteKeys.memberList(noteId),
    queryFn: async (): Promise<NoteMember[]> => {
      const repo = await getRepository();
      return repo.getNoteMembers(noteId);
    },
    enabled: isEnabled,
  });
}

export function useCreateNote() {
  const { getRepository, userId, userEmail } = useNoteRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      title,
      visibility,
    }: {
      title: string;
      visibility: Note["visibility"];
    }) => {
      const repo = await getRepository();
      return repo.createNote(userId, title, visibility, userEmail);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

export function useUpdateNote() {
  const { getRepository, userId, userEmail } = useNoteRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      updates,
    }: {
      noteId: string;
      updates: Partial<Pick<Note, "title" | "visibility">>;
    }) => {
      const repo = await getRepository();
      await repo.updateNote(userId, noteId, updates, userEmail);
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
  const { getRepository, userId } = useNoteRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      const repo = await getRepository();
      await repo.deleteNote(userId, noteId);
      return noteId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

export function useAddPageToNote() {
  const { getRepository, userId } = useNoteRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, pageId }: { noteId: string; pageId: string }) => {
      const repo = await getRepository();
      await repo.addPageToNote(noteId, pageId, userId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.pageList(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
    },
  });
}

export function useRemovePageFromNote() {
  const { getRepository } = useNoteRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, pageId }: { noteId: string; pageId: string }) => {
      const repo = await getRepository();
      await repo.removePageFromNote(noteId, pageId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.pageList(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
    },
  });
}

export function useAddNoteMember() {
  const { getRepository, userId } = useNoteRepository();
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
      const repo = await getRepository();
      await repo.addNoteMember(noteId, memberEmail, role, userId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.memberList(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
    },
  });
}

export function useUpdateNoteMemberRole() {
  const { getRepository } = useNoteRepository();
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
      const repo = await getRepository();
      await repo.updateNoteMemberRole(noteId, memberEmail, role);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.memberList(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
    },
  });
}

export function useRemoveNoteMember() {
  const { getRepository } = useNoteRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      memberEmail,
    }: {
      noteId: string;
      memberEmail: string;
    }) => {
      const repo = await getRepository();
      await repo.removeNoteMember(noteId, memberEmail);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.memberList(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: noteKeys.details() });
    },
  });
}
