import { useEffect } from 'react';
import { usePageStore } from '@/stores/pageStore';

// Tutorial pages to seed the app on first run
const TUTORIAL_PAGES = [
  {
    title: '👋 Zediへようこそ',
    content: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Zediは「ゼロフリクション・ナレッジネットワーク」です。' }
          ]
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '書くストレスと整理する義務から解放され、思考を宇宙のように拡張していきましょう。' }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '基本的な考え方' }]
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '1つのページには1つのアイデアだけ' }]
                }
              ]
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '長文よりも、小さなページをリンクで繋ぐ' }]
                }
              ]
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '整理は後回し。まずは書き留める' }]
                }
              ]
            }
          ]
        }
      ]
    })
  },
  {
    title: '🔗 リンクの繋ぎ方',
    content: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Zediでは [[ページ名]] という形式でリンクを作成できます。' }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'リンクの種類' }]
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: '内部リンク: 既存のページへの接続' }
                  ]
                }
              ]
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'ゴーストリンク: まだ存在しないページへのリンク（後で自動生成される可能性あり）' }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'リンクされていないページは「発芽待ちの種」。無理に整理せず、将来の接続を待ちましょう。' }
          ]
        }
      ]
    })
  },
  {
    title: '✨ 思考を捕捉する',
    content: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '思いついたことは、すぐにページとして書き留めましょう。' }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '捕捉のコツ' }]
        },
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '右下の + ボタンで素早く新規ページ作成' }]
                }
              ]
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'タイトルは自動生成されるので、本文から書き始めてOK' }]
                }
              ]
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: '完璧を目指さず、まずは書き留める' }]
                }
              ]
            }
          ]
        },
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: '「白紙の恐怖」を感じたら、まず一言だけ書いてみてください。' }
              ]
            }
          ]
        }
      ]
    })
  }
];

const SEED_KEY = 'zedi-seeded';

export function useSeedData() {
  const { pages, createPage, updatePage } = usePageStore();

  useEffect(() => {
    // Check if we've already seeded
    const hasSeeded = localStorage.getItem(SEED_KEY);
    
    // Only seed if no pages exist and we haven't seeded before
    if (pages.length === 0 && !hasSeeded) {
      // Create tutorial pages with slight time offsets
      TUTORIAL_PAGES.forEach((tutorialPage, index) => {
        const page = createPage(tutorialPage.title, tutorialPage.content);
        // Adjust timestamps so they appear in order
        updatePage(page.id, {});
      });
      
      localStorage.setItem(SEED_KEY, 'true');
    }
  }, [pages.length, createPage, updatePage]);
}
