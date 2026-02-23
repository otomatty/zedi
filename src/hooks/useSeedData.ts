import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePagesSummary, useCreatePage } from "./usePageQueries";

// Tutorial pages to seed the app on first run
const TUTORIAL_PAGES = [
  {
    title: "👋 Zediへようこそ",
    content: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Zediは「ゼロフリクション・ナレッジネットワーク」です。",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "書くストレスと整理する義務から解放され、思考を宇宙のように拡張していきましょう。",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "基本的な考え方" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "1つのページには1つのアイデアだけ" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "長文よりも、小さなページをリンクで繋ぐ",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "整理は後回し。まずは書き留める" }],
                },
              ],
            },
          ],
        },
      ],
    }),
  },
  {
    title: "🔗 リンクの繋ぎ方",
    content: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Zediでは [[ページ名]] という形式でリンクを作成できます。",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "リンクの種類" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "内部リンク: 既存のページへの接続" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "ゴーストリンク: まだ存在しないページへのリンク（後で自動生成される可能性あり）",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "リンクされていないページは「発芽待ちの種」。無理に整理せず、将来の接続を待ちましょう。",
            },
          ],
        },
      ],
    }),
  },
  {
    title: "✨ 思考を捕捉する",
    content: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "思いついたことは、すぐにページとして書き留めましょう。",
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "捕捉のコツ" }],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "右下の + ボタンで素早く新規ページ作成",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "タイトルは自動生成されるので、本文から書き始めてOK",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "完璧を目指さず、まずは書き留める" }],
                },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "「白紙の恐怖」を感じたら、まず一言だけ書いてみてください。",
                },
              ],
            },
          ],
        },
      ],
    }),
  },
];

const SEED_KEY = "zedi-seeded";

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
      setIsSeeding(true);
      console.log("Seeding tutorial pages...");

      // Create tutorial pages sequentially
      const seedPages = async () => {
        for (const tutorialPage of TUTORIAL_PAGES) {
          try {
            await createPageMutation.mutateAsync({
              title: tutorialPage.title,
              content: tutorialPage.content,
            });
            console.log("Created tutorial page:", tutorialPage.title);
            // Small delay to ensure proper ordering
            await new Promise((resolve) => setTimeout(resolve, 50));
          } catch (error) {
            console.error("Failed to create tutorial page:", error);
          }
        }
        localStorage.setItem(SEED_KEY, "true");
        console.log("Tutorial pages seeded successfully");
      };

      seedPages().finally(() => setIsSeeding(false));
    }
  }, [isSignedIn, pages, isLoading, isSuccess, createPageMutation]);

  return { isSeeding };
}
