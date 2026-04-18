import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Container from "@/components/layout/Container";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { cn } from "@zedi/ui";

interface NotesLayoutProps {
  children: React.ReactNode;
}

/**
 * Tabbed layout for `/notes` routes (my notes / discover).
 * The shared `AppLayout`（ヘッダー・サイドバー・AI ドック）はルートレベルで適用されるため、ここではタブ＋本文のみを描画する。
 *
 * `/notes` 系のタブ付きレイアウト（マイノート / 発見）。共通 `AppLayout` は親ルートで適用される。
 */
export const NotesLayout: React.FC<NotesLayoutProps> = ({ children }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isSignedIn = useAuth().isSignedIn ?? false;

  const isMyNotes = location.pathname === "/notes" || location.pathname === "/notes/";
  const isDiscover = location.pathname === "/notes/discover";

  const handleMyNotesClick = (e: React.MouseEvent) => {
    if (!isSignedIn) {
      e.preventDefault();
      navigate("/sign-in");
    }
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto py-6">
      <Container>
        <div className="border-border mb-6 flex border-b">
          <Link
            to="/notes"
            onClick={handleMyNotesClick}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              isMyNotes
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t("notes.tabMyNotes")}
          </Link>
          <Link
            to="/notes/discover"
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              isDiscover
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t("notes.tabDiscover")}
          </Link>
        </div>
        {children}
      </Container>
    </main>
  );
};
