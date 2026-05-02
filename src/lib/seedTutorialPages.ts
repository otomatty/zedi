import type { TFunction } from "i18next";

/**
 * オンボーディング用シードページ 1 件。Tiptap `doc` JSON を `content` にシリアル化。
 * / One seed tutorial page. `content` is a serialized Tiptap `doc` JSON.
 */
export interface SeedTutorialPage {
  title: string;
  content: string;
}

/**
 * 現在ロケールの i18n 文字列から初回起動用チュートリアルページ定義を組み立てる（純粋: `t` を引数化）。
 * Builds the guest-first-run tutorial pages from the active locale (pure, inject `t`).
 */
export function buildSeedTutorialPages(t: TFunction): SeedTutorialPage[] {
  return [
    {
      title: t("seedData.welcome.title"),
      content: JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: t("seedData.welcome.p1") }] },
          { type: "paragraph", content: [{ type: "text", text: t("seedData.welcome.p2") }] },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: t("seedData.welcome.hBasics") }],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: t("seedData.welcome.li1") }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: t("seedData.welcome.li2") }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: t("seedData.welcome.li3") }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    },
    {
      title: t("seedData.links.title"),
      content: JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: t("seedData.links.p1") }] },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: t("seedData.links.hTypes") }],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: t("seedData.links.liInternal") }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: t("seedData.links.liGhost") }],
                  },
                ],
              },
            ],
          },
          { type: "paragraph", content: [{ type: "text", text: t("seedData.links.p2") }] },
        ],
      }),
    },
    {
      title: t("seedData.capture.title"),
      content: JSON.stringify({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: t("seedData.capture.p1") }] },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: t("seedData.capture.hTips") }],
          },
          {
            type: "orderedList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: t("seedData.capture.o1") }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: t("seedData.capture.o2") }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: t("seedData.capture.o3") }],
                  },
                ],
              },
            ],
          },
          {
            type: "blockquote",
            content: [
              { type: "paragraph", content: [{ type: "text", text: t("seedData.capture.quote") }] },
            ],
          },
        ],
      }),
    },
  ];
}
