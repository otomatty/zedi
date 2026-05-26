import React, { useCallback } from "react";
import Container from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  SignedInMenuContent,
  SignedOutMenuContent,
} from "@/components/layout/BottomNav/BottomNavMeContent";
import { SignedIn, SignedOut } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

/**
 * Account hub for mobile bottom-nav "Me" and direct `/account` navigation.
 * Reuses the same menu content as the desktop avatar dropdown so account
 * actions, sync status, and sign-in/out stay in one place.
 *
 * モバイルボトムナビの「Me」および `/account` 直リンク向けのアカウントハブ。
 * デスクトップのアバターメニューと同じ内容を再利用し、アカウント操作・同期・
 * サインイン/アウトの単一ソースを保つ。
 */
const Account: React.FC = () => {
  const { t } = useTranslation();
  const noopClose = useCallback(() => {}, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("nav.account", "Account")} />

      <div className="min-h-0 flex-1 py-6">
        <Container>
          <div
            className="border-border bg-card mx-auto max-w-2xl overflow-hidden rounded-lg border shadow-sm"
            data-testid="account-page-content"
          >
            <SignedIn>
              <SignedInMenuContent onClose={noopClose} />
            </SignedIn>
            <SignedOut>
              <SignedOutMenuContent onClose={noopClose} />
            </SignedOut>
          </div>
        </Container>
      </div>
    </div>
  );
};

export default Account;
