// Home page - Main Time Axis view
import { createSignal, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { TimeAxis } from "../components/layout/TimeAxis";
import { PageEditorModal } from "../components/layout/PageEditorModal";
import { Header } from "../components/layout/Header";
import { pageStore } from "../stores/pageStore";
import { authStore } from "../stores/authStore";
import type { Page } from "../types/page";

export function Home() {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [selectedPage, setSelectedPage] = createSignal<Page | undefined>(undefined);
  
  // Initialize page store on mount
  onMount(() => {
    pageStore.initialize();
  });

  const handleNewPage = () => {
    setSelectedPage(undefined);
    setIsModalOpen(true);
  };

  const handlePageClick = (page: Page) => {
    // Navigate to page detail
    navigate(`/page/${page.id}`);
  };

  const handleSavePage = async (title: string, content: string) => {
    setIsSaving(true);
    try {
      await pageStore.createPage({
        title: title || "無題のページ",
        content,
      });
      setIsModalOpen(false);
    } catch (error) {
      console.error("Failed to save page:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div class="min-h-screen bg-[var(--bg-base)]">
      {/* Header */}
      <Header
        isLoggedIn={authStore.isAuthenticated()}
        userName={authStore.user()?.user_metadata?.full_name || authStore.user()?.email}
        userAvatarUrl={authStore.user()?.user_metadata?.avatar_url}
      />

      {/* Main Content */}
      <main class="max-w-6xl mx-auto px-6 py-8">
        <TimeAxis
          cards={pageStore.pages()}
          isLoading={pageStore.loading()}
          onNewCard={handleNewPage}
          onCardClick={handlePageClick}
        />
      </main>

      {/* Page Editor Modal */}
      <PageEditorModal
        isOpen={isModalOpen()}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSavePage}
        page={selectedPage()}
        isSaving={isSaving()}
      />
    </div>
  );
}

export default Home;
