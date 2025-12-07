// Home page - Main Time Axis view
import { createSignal, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { TimeAxis } from "../components/layout/TimeAxis";
import { CardEditorModal } from "../components/layout/CardEditorModal";
import { cardStore } from "../stores/cardStore";
import type { Card } from "../types/card";

export function Home() {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [selectedCard, setSelectedCard] = createSignal<Card | undefined>(undefined);
  
  // Initialize card store on mount
  onMount(() => {
    cardStore.initialize();
  });

  const handleNewCard = () => {
    setSelectedCard(undefined);
    setIsModalOpen(true);
  };

  const handleCardClick = (card: Card) => {
    // Navigate to card detail page
    navigate(`/card/${card.id}`);
  };

  const handleSaveCard = async (title: string, content: string) => {
    setIsSaving(true);
    try {
      await cardStore.createCard({
        title: title || "無題のカード",
        content,
      });
      setIsModalOpen(false);
    } catch (error) {
      console.error("Failed to save card:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div class="min-h-screen bg-[var(--bg-base)]">
      {/* Main Content */}
      <main class="max-w-4xl mx-auto px-6 py-8">
        <TimeAxis
          cards={cardStore.cards()}
          isLoading={cardStore.loading()}
          onNewCard={handleNewCard}
          onCardClick={handleCardClick}
        />
      </main>

      {/* Card Editor Modal */}
      <CardEditorModal
        isOpen={isModalOpen()}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveCard}
        card={selectedCard()}
        isSaving={isSaving()}
      />
    </div>
  );
}

export default Home;
