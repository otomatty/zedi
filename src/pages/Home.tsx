import React, { useCallback, useEffect } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import Container from "@/components/layout/Container";
import PageGrid from "@/components/page/PageGrid";
import FloatingActionButton from "@/components/layout/FloatingActionButton";
import { HomePageCount } from "@/components/layout/HomePageCount";
import { useSeedData } from "@/hooks/useSeedData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { useAuth } from "@/hooks/useAuth";
import { isClipUrlAllowed } from "@/lib/webClipper";

const HOME_PATH = "/home";

/**
 * Home page: page grid, FAB, and optional clip URL handling.
 * ホーム画面。ページグリッド・FAB・clip URL 処理。
 */
const Home: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isSeeding } = useSeedData();
  const { needsSetupWizard } = useOnboarding();
  const { isSignedIn } = useAuth();

  const clipUrl = searchParams.get("clipUrl");
  const validClipUrl = clipUrl && isClipUrlAllowed(clipUrl) ? clipUrl : undefined;

  // Chrome拡張からの clipUrl: 未ログイン時はサインインへ誘導し、復帰後に同URL再処理
  useEffect(() => {
    if (!validClipUrl || isSignedIn) return;
    const returnTo = `${HOME_PATH}?${new URLSearchParams({ clipUrl: validClipUrl, from: "chrome-extension" }).toString()}`;
    navigate(`/sign-in?${new URLSearchParams({ returnTo }).toString()}`, { replace: true });
  }, [validClipUrl, isSignedIn, navigate]);

  const handleClipDialogClosedWithInitialUrl = useCallback(() => {
    navigate(HOME_PATH, { replace: true });
  }, [navigate]);

  if (needsSetupWizard) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ContentWithAIChat
        floatingAction={
          <>
            <div className="mr-4 mb-4">
              {validClipUrl ? (
                <FloatingActionButton
                  initialClipUrl={validClipUrl}
                  onClipDialogClosedWithInitialUrl={handleClipDialogClosedWithInitialUrl}
                />
              ) : (
                <FloatingActionButton />
              )}
            </div>
            <HomePageCount />
          </>
        }
      >
        <div className="min-h-0 flex-1 py-6">
          <Container>
            <div className="min-h-[200px]">
              <PageGrid isSeeding={isSeeding} />
            </div>
          </Container>
        </div>
      </ContentWithAIChat>
    </div>
  );
};

export default Home;
