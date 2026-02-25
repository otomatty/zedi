import React, { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import PageGrid from "@/components/page/PageGrid";
import FloatingActionButton from "@/components/layout/FloatingActionButton";
import { QuickTour } from "@/components/tour/QuickTour";
import { useSeedData } from "@/hooks/useSeedData";
import { useOnboarding } from "@/hooks/useOnboarding";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";

const HOME_PATH = "/home";

const Home: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSeeding } = useSeedData();
  const { needsSetupWizard, isTourRunning, startTour, completeTour } = useOnboarding();

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

      <ContentWithAIChat floatingAction={<FloatingActionButton />}>
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
