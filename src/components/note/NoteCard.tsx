import React from "react";
import { useNavigate } from "react-router-dom";
import { Users, FileText } from "lucide-react";
import type { NoteSummary } from "@/types/note";
import { cn } from "@/lib/utils";
import { NoteVisibilityBadge } from "./NoteVisibilityBadge";

interface NoteCardProps {
  note: NoteSummary;
  index?: number;
}

const roleLabel: Record<NoteSummary["role"], string> = {
  owner: "所有者",
  editor: "編集者",
  viewer: "閲覧者",
  guest: "ゲスト",
  none: "不明",
};

export const NoteCard: React.FC<NoteCardProps> = ({ note, index = 0 }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/note/${note.id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left rounded-lg border border-border/50 bg-card",
        "p-4 hover:border-border transition-all duration-200",
        "animate-fade-in opacity-0",
        index <= 5 && `stagger-${Math.min(index + 1, 5)}`
      )}
      style={{
        animationFillMode: "forwards",
        animationDelay: `${index * 50}ms`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium text-sm text-foreground truncate">
            {note.title || "無題のノート"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {roleLabel[note.role]}
          </p>
        </div>
        <NoteVisibilityBadge visibility={note.visibility} />
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          {note.pageCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {note.memberCount}
        </span>
      </div>
    </button>
  );
};
