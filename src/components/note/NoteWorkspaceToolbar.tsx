import React, { useCallback, useState } from "react";
import { FolderOpen, FolderTree, Trash2 } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { isTauriDesktop } from "@/lib/platform";
import { listNoteWorkspaceEntries } from "@/lib/noteWorkspace/noteWorkspaceIo";
import { useNoteWorkspaceOptional } from "@/contexts/NoteWorkspaceContext";

/**
 * Note-linked local folder + shallow file tree (desktop, Issue #461).
 * ノートに紐づくローカルフォルダと浅いファイルツリー（デスクトップ、Issue #461）。
 */
export function NoteWorkspaceToolbar() {
  const { t } = useTranslation();
  const ctx = useNoteWorkspaceOptional();
  const [treeOpen, setTreeOpen] = useState(false);
  const [entries, setEntries] = useState<string[]>([]);
  const [relDir, setRelDir] = useState("");

  const root = ctx?.workspaceRoot ?? null;
  const noteId = ctx?.noteId ?? null;

  const fetchEntries = useCallback(
    async (dir: string) => {
      if (!root || !noteId) {
        setEntries([]);
        return;
      }
      const list = await listNoteWorkspaceEntries(noteId, dir);
      setEntries(list);
    },
    [root, noteId],
  );

  const openTree = useCallback(() => {
    setRelDir("");
    setEntries([]);
    setTreeOpen(true);
    void fetchEntries("");
  }, [fetchEntries]);

  if (!ctx || !isTauriDesktop()) return null;

  const displayPath = root ? (root.length > 48 ? `…${root.slice(-44)}` : root) : "";

  return (
    <>
      <div className="border-border/60 bg-muted/30 flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs">
        <span className="text-muted-foreground shrink-0">{t("editor.noteWorkspace.label")}</span>
        {root ? (
          <>
            <span
              className="text-foreground max-w-[min(60vw,28rem)] truncate font-mono"
              title={root}
            >
              {displayPath}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void ctx.pickWorkspace()}
            >
              <FolderOpen className="mr-1 h-3.5 w-3.5" />
              {t("editor.noteWorkspace.change")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 text-xs"
              onClick={openTree}
            >
              <FolderTree className="mr-1 h-3.5 w-3.5" />
              {t("editor.noteWorkspace.browse")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground h-7 w-7"
              onClick={() => ctx.clearWorkspace()}
              aria-label={t("editor.noteWorkspace.clear")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void ctx.pickWorkspace()}
          >
            <FolderOpen className="mr-1 h-3.5 w-3.5" />
            {t("editor.noteWorkspace.linkFolder")}
          </Button>
        )}
      </div>

      <Dialog
        open={treeOpen}
        onOpenChange={(open) => {
          setTreeOpen(open);
          if (!open) setRelDir("");
        }}
      >
        <DialogContent className="max-h-[min(70vh,520px)] max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("editor.noteWorkspace.treeTitle")}</DialogTitle>
          </DialogHeader>
          <div className="text-muted-foreground mb-2 font-mono text-xs">
            {relDir ? `${relDir}/` : "/"}
          </div>
          <div className="max-h-[min(50vh,360px)] overflow-y-auto rounded border p-2">
            {relDir ? (
              <button
                type="button"
                className="text-muted-foreground mb-1 block w-full text-left text-xs hover:underline"
                onClick={() => {
                  const parts = relDir.replace(/\/+$/, "").split("/");
                  parts.pop();
                  const parent = parts.join("/");
                  setRelDir(parent);
                  void fetchEntries(parent);
                }}
              >
                ..
              </button>
            ) : null}
            <ul className="space-y-0.5">
              {entries.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    className="hover:bg-muted/80 w-full rounded px-1 py-0.5 text-left font-mono text-xs"
                    onClick={() => {
                      if (!name.endsWith("/")) return;
                      const seg = name.slice(0, -1);
                      const next = relDir ? `${relDir}/${seg}` : seg;
                      setRelDir(next);
                      void fetchEntries(next);
                    }}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
            {entries.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t("editor.noteWorkspace.treeEmpty")}</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
