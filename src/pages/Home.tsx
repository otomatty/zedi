// Home page - Main Time Axis view
import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { TimeAxis } from "../components/layout/TimeAxis";
import { CardEditorModal } from "../components/layout/CardEditorModal";
import type { Card } from "../types/card";

export function Home() {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [selectedCard, setSelectedCard] = createSignal<Card | undefined>(undefined);
  
  // Demo data for when running in browser (not in Tauri)
  const [cards, setCards] = createSignal<Card[]>([
    {
      id: "1",
      title: "👋 Zediへようこそ",
      content: "<p>Zediは「書くストレス」と「整理する義務」からあなたを解放します。思いついたことを、ただ書く。それだけで知識のネットワークが生まれます。</p>",
      created_at: Math.floor(Date.now() / 1000) - 120, // 2 minutes ago
      updated_at: Math.floor(Date.now() / 1000) - 120,
      is_deleted: false,
    },
    {
      id: "2",
      title: "🔗 リンクの繋ぎ方",
      content: "<p>テキスト中に [[キーワード]] と入力するだけで、カード同士が繋がります。まだ存在しないカードへのリンク（Ghost Link）も作成できます。</p>",
      created_at: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
      updated_at: Math.floor(Date.now() / 1000) - 300,
      is_deleted: false,
    },
    {
      id: "3",
      title: "🤖 AIの使い方",
      content: "<p>/wiki コマンドを使うと、AIが選択したキーワードについて解説と関連トピックへのリンクを含むカードを自動生成します。</p>",
      created_at: Math.floor(Date.now() / 1000) - 600, // 10 minutes ago
      updated_at: Math.floor(Date.now() / 1000) - 600,
      is_deleted: false,
    },
  ]);
  const [isLoading, _setIsLoading] = createSignal(false);

  // TODO: Replace demo data with actual Tauri API calls when running in Tauri
  // onMount(async () => {
  //   setIsLoading(true);
  //   try {
  //     const data = await getCards();
  //     setCards(data);
  //   } catch (error) {
  //     console.error("Failed to load cards:", error);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // });

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
      // For demo, just add to local state
      const newCard: Card = {
        id: Date.now().toString(),
        title: title || "無題のカード",
        content,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        is_deleted: false,
      };
      
      // Add new card at the beginning
      setCards((prev) => [newCard, ...prev]);
      setIsModalOpen(false);
      
      // TODO: Use Tauri API when available
      // const newCard = await createCard({ title, content });
      // setCards((prev) => [newCard, ...prev]);
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
          cards={cards()}
          isLoading={isLoading()}
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
