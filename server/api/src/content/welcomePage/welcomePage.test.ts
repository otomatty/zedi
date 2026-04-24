import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { getSchema } from "@tiptap/core";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { welcomePageContent, WELCOME_PAGE_TITLE, type WelcomePageLocale } from "./index.js";
import { VideoServer } from "../../lib/videoServerExtension.js";

const extensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, link: false }),
  Link.configure({ openOnClick: false }),
  VideoServer,
];

describe("welcomePageContent", () => {
  const locales: WelcomePageLocale[] = ["ja", "en"];

  it.each(locales)("%s: has a non-empty title", (locale) => {
    expect(WELCOME_PAGE_TITLE[locale]).toMatch(/\S/);
  });

  it.each(locales)("%s: document root is a 'doc' node with children", (locale) => {
    const doc = welcomePageContent[locale];
    expect(doc.type).toBe("doc");
    expect(Array.isArray(doc.content)).toBe(true);
    expect((doc.content ?? []).length).toBeGreaterThan(5);
  });

  it.each(locales)(
    "%s: converts to a Y.Doc without throwing (Tiptap schema is compatible)",
    (locale) => {
      const doc = welcomePageContent[locale];
      const schema = getSchema(extensions);
      const ydoc = prosemirrorJSONToYDoc(schema, doc, "default");
      const update = Y.encodeStateAsUpdate(ydoc);
      expect(update.byteLength).toBeGreaterThan(0);
    },
  );

  it.each(locales)("%s: contains at least one video node with a src attribute", (locale) => {
    const doc = welcomePageContent[locale];
    const findVideo = (node: typeof doc): boolean => {
      if (node.type === "video" && typeof node.attrs?.src === "string") return true;
      if (Array.isArray(node.content)) {
        return node.content.some((child) => findVideo(child));
      }
      return false;
    };
    expect(findVideo(doc)).toBe(true);
  });

  it.each(locales)("%s: links to the locale-matching official guide note", (locale) => {
    const serialized = JSON.stringify(welcomePageContent[locale]);
    expect(serialized).toContain(`/notes/official-guide?lang=${locale}`);
  });
});
