import React from "react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import PageGrid from "@/components/page/PageGrid";
import FloatingActionButton from "@/components/layout/FloatingActionButton";
import { useSeedData } from "@/hooks/useSeedData";
import { NotesSection } from "@/components/note/NotesSection";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";
import { useOnboarding } from "@/hooks/useOnboarding";

const Home: React.FC = () => {
  // Seed tutorial pages on first run
  const { isSeeding } = useSeedData();

  // Onboarding state
  const { showWelcome, dismissWelcome } = useOnboarding();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="py-6">
        <Container>
          <NotesSection />
          <PageGrid isSeeding={isSeeding} />
        </Container>
      </main>

      <FloatingActionButton />

      {/* Welcome modal for first-time users */}
      <WelcomeModal open={showWelcome} onClose={dismissWelcome} />
    </div>
  );
};

export default Home;
