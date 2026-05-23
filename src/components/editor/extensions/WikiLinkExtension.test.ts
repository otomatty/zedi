import { describe, it, expect } from "vitest";
import { WikiLink, WIKI_LINK_PASTE_REGEX } from "./WikiLinkExtension";

/**
 * Tests for WikiLink paste rule.
 * WikiLink のペーストルールのテスト。
 */
describe("WikiLinkExtension paste rule", () => {
  describe("WIKI_LINK_PASTE_REGEX", () => {
    // 正規表現はキャプチャグループを持たず、マッチ全体 `[[Title]]` を対象とする
    // （Tiptap の `markPasteRule` に括弧ごとマークを付与させるため）。
    // The regex has no capture group; the full `[[Title]]` match is the target
    // so that Tiptap's `markPasteRule` applies the mark to the brackets as well.

    it("should match a basic [[Title]] pattern (full bracket form)", () => {
      const text = "[[MyPage]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("[[MyPage]]");
    });

    it("should match multiple [[WikiLink]] patterns in text", () => {
      const text = "See [[PageA]] and [[PageB]] for details";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("[[PageA]]");
      expect(matches[1][0]).toBe("[[PageB]]");
    });

    it("should match titles with spaces", () => {
      const text = "[[My Page Title]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("[[My Page Title]]");
    });

    it("should match titles with Japanese characters", () => {
      const text = "[[日本語ページ]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("[[日本語ページ]]");
    });

    it("should not match empty brackets [[]]", () => {
      const text = "[[]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("should match whitespace-only titles [[ ]] (handler filters via getAttributes)", () => {
      const text = "[[ ]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      // 正規表現自体は空白のみのタイトルもマッチさせるが、`getAttributes` 側で
      // トリム後に空だった場合は `false` を返してマーク適用を抑止する。
      // The regex itself matches whitespace-only titles, but `getAttributes`
      // returns `false` after trimming so no mark is applied.
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("[[ ]]");
    });

    it("should not match single brackets [Title]", () => {
      const text = "[Title]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("should not include extra outer brackets in a [[[Title]]] match", () => {
      // `[^[\]]` が `[` と `]` の両方を除外するため、`[[[Title]]]` は
      // 内側の `[[Title]]` のみにマッチする。
      // Because `[^[\]]` excludes both `[` and `]`, `[[[Title]]]` matches only
      // the inner `[[Title]]`.
      const text = "[[[Title]]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("[[Title]]");
    });
  });

  // Issue #931: WikiLink クリックハンドラが Cmd/Ctrl+クリックと中クリックを
  // 「新タブ意図」として伝搬することを検証する。`addProseMirrorPlugins`
  // から取り出した Plugin spec を直接実行して、`onLinkClick` 呼び出しの
  // 第 2 引数を検証する。
  // Issue #931: verify that the wiki-link click handler propagates
  // Cmd/Ctrl+click and middle-click as a "new tab" intent. Drives the
  // Plugin spec directly so we can assert the second argument of
  // `onLinkClick`.
  describe("WikiLink click handler (issue #931)", () => {
    type LinkClick = (title: string, options?: { newTab?: boolean }) => void;
    type HandleClick = (view: unknown, pos: number, event: MouseEvent) => boolean | undefined;
    type AuxClick = (view: unknown, event: MouseEvent) => boolean | undefined;

    function buildPlugin(onLinkClick: LinkClick) {
      const extension = WikiLink.configure({});
      const addProseMirrorPlugins = extension.config.addProseMirrorPlugins;
      if (typeof addProseMirrorPlugins !== "function") {
        throw new Error("addProseMirrorPlugins must be a function");
      }
      const context: Record<string, unknown> = {
        ...extension,
        options: { HTMLAttributes: {}, onLinkClick },
        parent: undefined,
      };
      const plugins = addProseMirrorPlugins.call(context) as Array<{
        spec: {
          props: {
            handleClick?: HandleClick;
            handleDOMEvents?: { auxclick?: AuxClick };
          };
        };
      }>;
      return plugins[0];
    }

    function makeWikiLinkSpan(title: string): HTMLElement {
      const span = document.createElement("span");
      span.setAttribute("data-wiki-link", "");
      span.setAttribute("data-title", title);
      document.body.appendChild(span);
      return span;
    }

    it("通常クリックでは newTab: false を伝える", () => {
      const onLinkClick = vi.fn();
      const plugin = buildPlugin(onLinkClick);
      const span = makeWikiLinkSpan("Some Page");
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "target", { value: span });

      const handled = plugin.spec.props.handleClick?.(null, 0, event);

      expect(handled).toBe(true);
      expect(onLinkClick).toHaveBeenCalledWith("Some Page", { newTab: false });
      span.remove();
    });

    it("Cmd+クリック (metaKey) では newTab: true を伝える", () => {
      const onLinkClick = vi.fn();
      const plugin = buildPlugin(onLinkClick);
      const span = makeWikiLinkSpan("Cmd Page");
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
      Object.defineProperty(event, "target", { value: span });

      plugin.spec.props.handleClick?.(null, 0, event);

      expect(onLinkClick).toHaveBeenCalledWith("Cmd Page", { newTab: true });
      span.remove();
    });

    it("Ctrl+クリック (ctrlKey) では newTab: true を伝える", () => {
      const onLinkClick = vi.fn();
      const plugin = buildPlugin(onLinkClick);
      const span = makeWikiLinkSpan("Ctrl Page");
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
      Object.defineProperty(event, "target", { value: span });

      plugin.spec.props.handleClick?.(null, 0, event);

      expect(onLinkClick).toHaveBeenCalledWith("Ctrl Page", { newTab: true });
      span.remove();
    });

    it("中クリック (button === 1) では auxclick 経由で newTab: true を伝える", () => {
      const onLinkClick = vi.fn();
      const plugin = buildPlugin(onLinkClick);
      const span = makeWikiLinkSpan("Middle Page");
      const event = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
      Object.defineProperty(event, "target", { value: span });

      const handled = plugin.spec.props.handleDOMEvents?.auxclick?.(null, event);

      expect(handled).toBe(true);
      expect(onLinkClick).toHaveBeenCalledWith("Middle Page", { newTab: true });
      span.remove();
    });

    it("中クリック以外の auxclick (button !== 1) は無視する", () => {
      const onLinkClick = vi.fn();
      const plugin = buildPlugin(onLinkClick);
      const span = makeWikiLinkSpan("Right Page");
      // 右クリック (button === 2) は新タブ対象外。
      const event = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 2 });
      Object.defineProperty(event, "target", { value: span });

      const handled = plugin.spec.props.handleDOMEvents?.auxclick?.(null, event);

      expect(handled).toBe(false);
      expect(onLinkClick).not.toHaveBeenCalled();
      span.remove();
    });

    it("wiki-link 要素以外のクリックは無視する", () => {
      const onLinkClick = vi.fn();
      const plugin = buildPlugin(onLinkClick);
      const plain = document.createElement("p");
      document.body.appendChild(plain);
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "target", { value: plain });

      const handled = plugin.spec.props.handleClick?.(null, 0, event);

      expect(handled).toBe(false);
      expect(onLinkClick).not.toHaveBeenCalled();
      plain.remove();
    });
  });

  describe("WikiLink extension configuration", () => {
    it("should have addPasteRules defined", () => {
      const extension = WikiLink.configure({});
      // The extension config should have paste rules
      expect(extension.config.addPasteRules).toBeDefined();
      expect(typeof extension.config.addPasteRules).toBe("function");
    });

    it("should keep existing functionality (parseHTML, renderHTML)", () => {
      const extension = WikiLink.configure({});
      expect(extension.config.parseHTML).toBeDefined();
      expect(extension.config.renderHTML).toBeDefined();
      expect(extension.config.addAttributes).toBeDefined();
    });

    describe("targetId attribute (issue #737)", () => {
      // 重複タイトル下でリネームを ID 一致で識別するため、wikiLink マークに
      // `targetId` 属性を追加した（issue #737 / 案 A）。本テスト群は属性宣言が
      // 正しい既定値・HTML ラウンドトリップを持つことを固定する。
      // Pin the schema for the new `targetId` attribute used by rename
      // propagation to discriminate same-title pages (issue #737, approach A).
      function getTargetIdSpec(): {
        default: unknown;
        parseHTML: (el: HTMLElement) => unknown;
        renderHTML: (attrs: Record<string, unknown>) => Record<string, unknown>;
      } {
        const extension = WikiLink.configure({});
        const addAttributes = extension.config.addAttributes;
        if (typeof addAttributes !== "function") {
          throw new Error("addAttributes must be a function");
        }
        type AddAttributesContext = Record<string, unknown> & {
          parent?: (() => Record<string, unknown>) | undefined;
        };
        const context: AddAttributesContext = {
          ...extension,
          parent: undefined,
        };
        const attrs = addAttributes.call(context) as Record<string, unknown>;
        const targetId = attrs.targetId as ReturnType<typeof getTargetIdSpec>;
        if (!targetId) throw new Error("targetId attribute missing");
        return targetId;
      }

      it("declares a targetId attribute with default null", () => {
        const spec = getTargetIdSpec();
        expect(spec.default).toBeNull();
      });

      it("parses targetId from data-target-id on the rendered span", () => {
        const spec = getTargetIdSpec();
        const el = document.createElement("span");
        el.setAttribute("data-target-id", "11111111-aaaa-bbbb-cccc-000000000001");
        expect(spec.parseHTML(el)).toBe("11111111-aaaa-bbbb-cccc-000000000001");

        const empty = document.createElement("span");
        expect(spec.parseHTML(empty)).toBeNull();

        empty.setAttribute("data-target-id", "");
        expect(spec.parseHTML(empty)).toBeNull();
      });

      it("omits data-target-id when targetId is null or empty", () => {
        // 属性が無いマーク（旧データや未解決状態）で `data-target-id=""` を出さない
        // ことで、サーバ側 `rewriteTitleRefsInDoc` が「id が無い → タイトル fallback」
        // と判定できるようにする。
        // Pre-issue-#737 marks (and unresolved fresh pastes) must not emit a
        // `data-target-id` attribute so the server-side rewriter sees them as
        // id-less and falls back to title matching.
        const spec = getTargetIdSpec();
        expect(spec.renderHTML({ targetId: null })).toEqual({});
        expect(spec.renderHTML({ targetId: "" })).toEqual({});
        expect(spec.renderHTML({})).toEqual({});
      });

      it("emits data-target-id when targetId is a non-empty string", () => {
        const spec = getTargetIdSpec();
        expect(spec.renderHTML({ targetId: "11111111-aaaa-bbbb-cccc-000000000001" })).toEqual({
          "data-target-id": "11111111-aaaa-bbbb-cccc-000000000001",
        });
      });
    });
  });
});
