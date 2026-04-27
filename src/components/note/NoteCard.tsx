import React from "react";
import { useNavigate } from "react-router-dom";
import { Users, FileText } from "lucide-react";
import type { NoteSummary } from "@/types/note";
import { cn } from "@zedi/ui";
import { NoteVisibilityBadge } from "./NoteVisibilityBadge";
import { Badge } from "@zedi/ui";
import { useTranslation } from "react-i18next";

interface NoteCardProps {
  note: NoteSummary;
  index?: number;
}

/**
 *
 */
export /**
 *
 */
const NoteCard: React.FC<NoteCardProps> = ({ note, index = 0 }) => {
  /**
   *
   */
  const navigate = useNavigate();
  /**
   *
   */
  const { t } = useTranslation();

  /**
   *
   */
  const handleClick = () => {
    navigate(`/notes/${note.id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "border-border/50 bg-card w-full rounded-lg border text-left",
        "hover:border-border p-4 transition-all duration-200",
        "animate-fade-in opacity-0",
        index <= 5 && `stagger-${Math.min(index + 1, 5)}`,
      )}
      style={{
        animationFillMode: "forwards",
        animationDelay: `${index * 50}ms`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-foreground truncate text-sm font-medium">
            {note.title || t("common.page.untitledNote")}
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {t(
              (
                {
                  owner: "common.note.owner",
                  editor: "common.note.editor",
                  viewer: "common.note.viewer",
                  guest: "common.note.guest",
                  none: "common.note.roleUnknown",
                } as const
              )[note.role],
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {note.isOfficial && <Badge variant="secondary">{t("notes.officialBadge")}</Badge>}
          <NoteVisibilityBadge visibility={note.visibility} />
        </div>
      </div>

      <div className="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
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
