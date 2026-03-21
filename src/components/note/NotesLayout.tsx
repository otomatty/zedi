import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Container from "@/components/layout/Container";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { cn } from "@zedi/ui";

interface NotesLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout for `/notes` routes: App shell + tab navigation (my notes / discover).
 * `/notes` 系のタブ付きレイアウト（マイノート / 発見）。
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
    <AppLayout>
      <main className="py-6">
        <Container>
          <div className="mb-6 flex border-b border-border">
            <Link
              to="/notes"
              onClick={handleMyNotesClick}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                isMyNotes
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
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
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t("notes.tabDiscover")}
            </Link>
          </div>
          {children}
        </Container>
      </main>
    </AppLayout>
  );
};
