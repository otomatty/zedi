import React from "react";
import Header from "@/components/layout/Header";
import Container from "@/components/layout/Container";
import PageGrid from "@/components/page/PageGrid";
import FloatingActionButton from "@/components/layout/FloatingActionButton";
import { useSeedData } from "@/hooks/useSeedData";

const Home: React.FC = () => {
  // Seed tutorial pages on first run
  useSeedData();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="py-6">
        <Container>
          <PageGrid />
        </Container>
      </main>

      <FloatingActionButton />
    </div>
  );
};

export default Home;
