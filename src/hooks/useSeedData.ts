import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePagesSummary, useCreatePage } from "./usePageQueries";
import i18n from "@/i18n";
import { buildSeedTutorialPages } from "@/lib/seedTutorialPages";

const SEED_KEY = "zedi-seeded";

/**
 * 未ログイン初回利用者向けのチュートリアルページを作成する。
 * / Seeds tutorial pages for first-time unsigned users.
 */
export function useSeedData() {
  const { isSignedIn } = useAuth();
  const { data: pages, isLoading, isSuccess } = usePagesSummary();
  const createPageMutation = useCreatePage();
  const hasSeededRef = useRef(false);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    if (isSignedIn) return;
    // Wait for pages to load successfully
    if (isLoading || !isSuccess) return;

    // Prevent multiple seeding attempts
    if (hasSeededRef.current) return;

    // Check if we've already seeded in localStorage
    const hasSeeded = localStorage.getItem(SEED_KEY);
    if (hasSeeded) return;

    // Only seed if no pages exist (pages is guaranteed to be defined when isSuccess is true)
    if (pages.length === 0) {
      hasSeededRef.current = true;
      queueMicrotask(() => setIsSeeding(true));

      const t = i18n.getFixedT(i18n.language);
      const tutorialPages = buildSeedTutorialPages(t);

      // Create tutorial pages sequentially
      const seedPages = async () => {
        for (const tutorialPage of tutorialPages) {
          try {
            await createPageMutation.mutateAsync({
              title: tutorialPage.title,
              content: tutorialPage.content,
            });
            // Small delay to ensure proper ordering
            await new Promise((resolve) => setTimeout(resolve, 50));
          } catch (error) {
            console.error("Failed to create tutorial page:", error);
          }
        }
        localStorage.setItem(SEED_KEY, "true");
      };

      seedPages().finally(() => setIsSeeding(false));
    }
  }, [isSignedIn, pages, isLoading, isSuccess, createPageMutation]);

  return { isSeeding };
}
