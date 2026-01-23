import React from "react";
import { Badge } from "@/components/ui/badge";
import type { NoteVisibility } from "@/types/note";

const visibilityLabels: Record<NoteVisibility, string> = {
  private: "非公開",
  public: "公開",
  unlisted: "限定公開(URL)",
  restricted: "限定公開(招待)",
};

const visibilityVariant: Record<NoteVisibility, "outline" | "secondary"> = {
  private: "outline",
  public: "secondary",
  unlisted: "secondary",
  restricted: "outline",
};

interface NoteVisibilityBadgeProps {
  visibility: NoteVisibility;
}

export const NoteVisibilityBadge: React.FC<NoteVisibilityBadgeProps> = ({
  visibility,
}) => {
  return (
    <Badge variant={visibilityVariant[visibility]}>
      {visibilityLabels[visibility]}
    </Badge>
  );
};
