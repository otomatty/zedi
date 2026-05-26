import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import Container from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { SignedIn, SignedOut } from "@/hooks/useAuth";
import { SignedInMenuContent, SignedOutMenuContent } from "@/components/layout/Header/UnifiedMenu";

/**
 * Account hub page. Replaces the mobile bottom-nav "Account" Sheet with a
 * real route so the entry behaves like the other primary tabs (history,
 * deep-linking, back button). Renders the same {@link SignedInMenuContent} /
 * {@link SignedOutMenuContent} that powers the header avatar menu so the
 * account surface stays the single source of truth.
 *
 * アカウントハブのページ。モバイルボトムナビの「アカウント」Sheet を実ルートに
 * 置き換え、他のプライマリタブと同じくページ遷移として扱えるようにする
 * （履歴 / ディープリンク / 戻るボタンが効く）。ヘッダーアバターメニューと
 * 同じ {@link SignedInMenuContent} / {@link SignedOutMenuContent} を描画し、
 * アカウント UI の単一ソースを維持する。
 */
const Account: React.FC = () => {
  const { t } = useTranslation();

  // The shared menu content takes an `onClose` prop so it can dismiss its
  // parent Sheet / Dropdown after navigating. On this page there is no
  // parent surface to close, so the callback is intentionally a no-op.
  // 共有メニューはリンクタップ後に親 Sheet / Dropdown を閉じるための
  // `onClose` を受け取るが、ページ表示では閉じる対象がないので noop にする。
  const noopClose = useCallback(() => {}, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("nav.account", "Account")} />

      <div className="min-h-0 flex-1 py-6">
        <Container>
          <div
            data-testid="account-page-content"
            className="bg-card border-border mx-auto max-w-md overflow-hidden rounded-lg border shadow-sm"
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
