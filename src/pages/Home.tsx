import React from 'react';
import Header from '@/components/layout/Header';
import PageGrid from '@/components/page/PageGrid';
import FloatingActionButton from '@/components/layout/FloatingActionButton';
import { useSeedData } from '@/hooks/useSeedData';

const Home: React.FC = () => {
  // Seed tutorial pages on first run
  useSeedData();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-6">
        <PageGrid />
      </main>

      <FloatingActionButton />
    </div>
  );
};

export default Home;
