import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Copy } from "lucide-react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import { NoteVisibilityBadge } from "@/components/note/NoteVisibilityBadge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useDeleteNote, useNote, useUpdateNote } from "@/hooks/useNoteQueries";
import type { NoteVisibility } from "@/types/note";

const visibilityOptions: Array<{ value: NoteVisibility; label: string }> = [
  { value: "private", label: "非公開" },
  { value: "public", label: "公開" },
  { value: "unlisted", label: "限定公開(URL)" },
  { value: "restricted", label: "限定公開(招待)" },
];

const NoteSettings: React.FC = () => {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const {
    note,
    access,
    source,
    isLoading: isNoteLoading,
  } = useNote(noteId ?? "", { allowRemote: true });

  const canManage = Boolean(access?.canManageMembers && source === "local");
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();

  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("private");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setVisibility(note.visibility);
    }
  }, [note]);

  const noteUrl = useMemo(() => {
    if (!noteId) return "";
    return `${window.location.origin}/note/${noteId}`;
  }, [noteId]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(noteUrl);
      toast({ title: "リンクをコピーしました" });
    } catch (error) {
      console.error("Failed to copy link:", error);
      toast({ title: "リンクのコピーに失敗しました", variant: "destructive" });
    }
  };

  const handleSaveNote = async () => {
    if (!noteId) return;
    try {
      await updateNoteMutation.mutateAsync({
        noteId,
        updates: { title: title.trim(), visibility },
      });
      toast({ title: "ノートを更新しました" });
    } catch (error) {
      console.error("Failed to update note:", error);
      toast({ title: "ノートの更新に失敗しました", variant: "destructive" });
    }
  };

  const handleDeleteNote = async () => {
    if (!noteId) return;
    try {
      await deleteNoteMutation.mutateAsync(noteId);
      toast({ title: "ノートを削除しました" });
      setIsDeleteDialogOpen(false);
      navigate("/home");
    } catch (error) {
      console.error("Failed to delete note:", error);
      toast({ title: "ノートの削除に失敗しました", variant: "destructive" });
    }
  };

  if (isNoteLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10">
          <Container>
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          </Container>
        </main>
      </div>
    );
  }

  if (!note || !access?.canView) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10">
          <Container>
            <p className="text-sm text-muted-foreground">
              ノートが見つからないか、閲覧権限がありません。
            </p>
          </Container>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-8">
        <Container>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold truncate">ノート設定</h1>
                <NoteVisibilityBadge visibility={visibility} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground truncate">
                {note.title || "無題のノート"}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/note/${note.id}`}>ノートへ戻る</Link>
            </Button>
          </div>

          {!canManage ? (
            <p className="mt-6 text-sm text-muted-foreground">
              設定を変更する権限がありません。
            </p>
          ) : (
            <>
              <section className="mt-6 rounded-lg border border-border/60 p-4">
                <h2 className="text-sm font-semibold mb-3">共有リンク</h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input value={noteUrl} readOnly />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLink}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    コピー
                  </Button>
                </div>
              </section>

              <section className="mt-6 rounded-lg border border-border/60 p-4">
                <h2 className="text-sm font-semibold mb-3">公開設定</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="note-title-input">タイトル</Label>
                    <Input
                      id="note-title-input"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="ノートタイトル"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>公開範囲</Label>
                    <Select
                      value={visibility}
                      onValueChange={(value) =>
                        setVisibility(value as NoteVisibility)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="公開範囲を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {visibilityOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={handleSaveNote}
                    disabled={updateNoteMutation.isPending}
                  >
                    {updateNoteMutation.isPending ? "保存中..." : "保存"}
                  </Button>
                </div>
              </section>

              <section className="mt-6 rounded-lg border border-destructive/40 p-4">
                <h2 className="text-sm font-semibold text-destructive mb-3">
                  ノートの削除
                </h2>
                <p className="text-sm text-muted-foreground">
                  ノートを削除すると、ノートへのアクセスができなくなります。
                </p>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="destructive"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    ノートを削除
                  </Button>
                </div>
              </section>
            </>
          )}
        </Container>
      </main>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ノートを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{note.title || "無題のノート"}」を削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteNoteMutation.isPending}
            >
              {deleteNoteMutation.isPending ? "削除中..." : "削除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default NoteSettings;
