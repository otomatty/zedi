import React, { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import PageGrid from "@/components/page/PageGrid";
import FloatingActionButton from "@/components/layout/FloatingActionButton";
import { useSeedData } from "@/hooks/useSeedData";
import { useOnboarding } from "@/hooks/useOnboarding";

const Home: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSeeding } = useSeedData();
  const { needsSetupWizard, startTour } = useOnboarding();

  // When returning from onboarding with "start tour", trigger the tour
  useEffect(() => {
    const state = location.state as { startTour?: boolean } | null;
    if (state?.startTour) {
      startTour();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate, startTour]);

  if (needsSetupWizard) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="py-6">
        <Container>
          <PageGrid isSeeding={isSeeding} />
        </Container>
      </main>

      <FloatingActionButton />
    </div>
  );
};

export default Home;
