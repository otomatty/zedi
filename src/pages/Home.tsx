import React from "react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import PageGrid from "@/components/page/PageGrid";
import FloatingActionButton from "@/components/layout/FloatingActionButton";
import { useSeedData } from "@/hooks/useSeedData";
import { NotesSection } from "@/components/note/NotesSection";

const Home: React.FC = () => {
  // Seed tutorial pages on first run
  const { isSeeding } = useSeedData();

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
    </div>
  );
};

export default Home;
