import React, { useCallback, useEffect } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import PageGrid from "@/components/page/PageGrid";
import FloatingActionButton from "@/components/layout/FloatingActionButton";
import { HomePageCount } from "@/components/layout/HomePageCount";
import { QuickTour } from "@/components/tour/QuickTour";
import { useSeedData } from "@/hooks/useSeedData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { useAuth } from "@/hooks/useAuth";
import { isClipUrlAllowed } from "@/lib/webClipper";

const HOME_PATH = "/home";

/**
 * Home page: page grid, FAB, quick tour, and optional clip URL handling.
 * ホーム画面。ページグリッド・FAB・クイックツアー・clip URL処理。
 */
const Home: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isSeeding } = useSeedData();
  const { needsSetupWizard, isTourRunning, startTour, completeTour } = useOnboarding();
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

  // When returning from onboarding with "start tour", trigger the tour
  useEffect(() => {
    const state = location.state as { startTour?: boolean } | null;
    if (state?.startTour) {
      startTour();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate, startTour]);

  // End tour when user navigates away from home
  useEffect(() => {
    if (isTourRunning && location.pathname !== HOME_PATH) {
      completeTour();
    }
  }, [isTourRunning, location.pathname, completeTour]);

  if (needsSetupWizard) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <QuickTour run={isTourRunning} onComplete={completeTour} />

      <Header />

      <ContentWithAIChat
        floatingAction={
          <>
            <div className="mb-4 mr-4">
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
        <main className="py-6">
          <Container>
            <div data-tour-id="tour-home-page-grid" className="min-h-[200px]">
              <PageGrid isSeeding={isSeeding} />
            </div>
          </Container>
        </main>
      </ContentWithAIChat>
    </div>
  );
};

export default Home;
