import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import { useNotes, useCreateNote } from "@/hooks/useNoteQueries";
import type { NoteVisibility } from "@/types/note";
import { NoteCard } from "@/components/note/NoteCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const visibilityOptions: Array<{ value: NoteVisibility; label: string }> = [
  { value: "private", label: "非公開" },
  { value: "public", label: "公開" },
  { value: "unlisted", label: "限定公開(URL)" },
  { value: "restricted", label: "限定公開(招待)" },
];

const Notes: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: notes = [], isLoading } = useNotes();
  const createNoteMutation = useCreateNote();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("private");

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
    [notes]
  );

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({
        title: "タイトルを入力してください",
        variant: "destructive",
      });
      return;
    }

    try {
      const newNote = await createNoteMutation.mutateAsync({
        title: title.trim(),
        visibility,
      });
      setIsDialogOpen(false);
      setTitle("");
      setVisibility("private");
      navigate(`/note/${newNote.id}`);
    } catch (error) {
      console.error("Failed to create note:", error);
      toast({
        title: "ノートの作成に失敗しました",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="py-6">
        <Container>
          {/* Page title & New note */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-semibold">ノート</h1>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  新規ノート
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>新しいノート</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="note-title">タイトル</Label>
                    <Input
                      id="note-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="例: チーム共有メモ"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>公開範囲</Label>
                    <Select
                      value={visibility}
                      onValueChange={(v) => setVisibility(v as NoteVisibility)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="公開範囲を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {visibilityOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    onClick={handleCreate}
                    disabled={createNoteMutation.isPending}
                  >
                    {createNoteMutation.isPending ? "作成中..." : "作成"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* 参加しているノート */}
          <section className="mb-10">
            <h2 className="text-lg font-medium text-foreground mb-4">
              参加しているノート
            </h2>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">読み込み中...</p>
            ) : sortedNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                参加しているノートはまだありません。
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sortedNotes.map((note, index) => (
                  <NoteCard key={note.id} note={note} index={index} />
                ))}
              </div>
            )}
          </section>

          {/* みんなのノート（誰でも参加できるノート）— 仕様検討用プレースホルダー */}
          <section>
            <h2 className="text-lg font-medium text-foreground mb-4">
              みんなのノート
            </h2>
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                誰でも参加できるノートの一覧や、様々な情報に触れられるUIは
                <br />
                仕様検討後に実装予定です。
              </p>
            </div>
          </section>
        </Container>
      </main>
    </div>
  );
};

export default Notes;
