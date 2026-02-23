import React from "react";
import { Badge } from "@/components/ui/badge";
import type { NoteVisibility } from "@/types/note";
import { useTranslation } from "react-i18next";

const visibilityKeys: Record<NoteVisibility, string> = {
  private: "notes.visibilityPrivate",
  public: "notes.visibilityPublic",
  unlisted: "notes.visibilityUnlisted",
  restricted: "notes.visibilityRestricted",
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

export const NoteVisibilityBadge: React.FC<NoteVisibilityBadgeProps> = ({ visibility }) => {
  const { t } = useTranslation();
  return <Badge variant={visibilityVariant[visibility]}>{t(visibilityKeys[visibility])}</Badge>;
};
