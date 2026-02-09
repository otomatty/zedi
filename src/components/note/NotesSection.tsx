import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useNotes, useCreateNote, useNoteApi } from "@/hooks/useNoteQueries";
import type { NoteVisibility } from "@/types/note";
import { NoteCard } from "./NoteCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const visibilityOptions: Array<{ value: NoteVisibility; label: string }> = [
  { value: "private", label: "非公開" },
  { value: "public", label: "公開" },
  { value: "unlisted", label: "限定公開(URL)" },
  { value: "restricted", label: "限定公開(招待)" },
];

export const NotesSection: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSignedIn } = useNoteApi();
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

  if (!isSignedIn) {
    return null;
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">公開ノート</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              新規ノート
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新しい公開ノート</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="note-title">タイトル</Label>
                <Input
                  id="note-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例: チーム共有メモ"
                />
              </div>
              <div className="space-y-2">
                <Label>公開範囲</Label>
                <Select
                  value={visibility}
                  onValueChange={(value) => setVisibility(value as NoteVisibility)}
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : sortedNotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          公開ノートはまだありません。
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedNotes.map((note, index) => (
            <NoteCard key={note.id} note={note} index={index} />
          ))}
        </div>
      )}
    </section>
  );
};
