import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  Tag,
  TAG_INPUT_REGEX,
  TAG_PASTE_REGEX,
  extractTagName,
  isExcludedTagName,
} from "./TagExtension";

/**
 * Tests for Tag mark extension (hashtag `#name` syntax).
 * タグマーク拡張（`#name` 形式）のテスト。
 *
 * See issue #725 (Phase 1). The regex is intentionally broad; fine-grained
 * exclusions (numeric-only, hex colors) are enforced in `getAttributes` via
 * `isExcludedTagName` so that reject reasons are colocated with the data shape.
 *
 * `TAG_PASTE_REGEX` intentionally has no capture group so Tiptap's
 * `markPasteRule` applies the mark to the full `#name` literal (the same
 * contract as `WIKI_LINK_PASTE_REGEX`). Tests below assert the full match
 * includes the leading `#` and that no capture group is introduced.
 */
describe("TagExtension paste rule", () => {
  describe("TAG_PASTE_REGEX", () => {
    it("has no capture group — full match preserves the leading `#`", () => {
      // `markPasteRule` が最後のキャプチャグループを優先する仕様を悪用しない
      // ように、正規表現全体を単一の一致として扱う。
      // Guards against a regression where a capture group is reintroduced and
      // `markPasteRule` strips the leading `#` from pasted text.
      const matches = [..."#tech".matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0]).toHaveLength(1);
      expect(matches[0][0]).toBe("#tech");
    });

    it("matches a basic #tag pattern", () => {
      const text = "I like #tech";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("#tech");
    });

    it("matches multiple tags in a sentence", () => {
      const text = "See #tech and #design for details";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("#tech");
      expect(matches[1][0]).toBe("#design");
    });

    it("matches a tag at the very start of input", () => {
      const text = "#intro leads the document";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("#intro");
    });

    it("matches CJK / Japanese tag names", () => {
      const text = "これは #技術 と #趣味 のテスト";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("#技術");
      expect(matches[1][0]).toBe("#趣味");
    });

    it("matches tags with hyphens and underscores", () => {
      const text = "#front-end and #back_end";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("#front-end");
      expect(matches[1][0]).toBe("#back_end");
    });

    it("does not match `#` followed by whitespace (Markdown heading)", () => {
      const text = "# Heading";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("does not match `## ` (Markdown level 2 heading)", () => {
      const text = "## Subheading";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("does not match `#` embedded in a word (e.g. `abc#tag`)", () => {
      // `abc#tag` のように単語中に現れる `#` はタグと見なさない（URLやID等）。
      // `#` inside a word is not a tag (could be URL/ID).
      const text = "abc#tag";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("does not match URL fragments (e.g. `example.com#section`)", () => {
      const text = "Visit https://example.com#section for details";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("does not match a slash-prefixed fragment (e.g. `/page#anchor`)", () => {
      const text = "See /page#anchor";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("terminates on punctuation boundaries", () => {
      const text = "finish #tech, then #design.";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("#tech");
      expect(matches[1][0]).toBe("#design");
    });

    it("terminates on Japanese punctuation boundaries (、。)", () => {
      const text = "まず#技術、それから#趣味。";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("#技術");
      expect(matches[1][0]).toBe("#趣味");
    });

    it("does not match empty `#` alone", () => {
      const text = "# ";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });
  });

  describe("isExcludedTagName", () => {
    // 数字のみ: `#1`, `#42` などは連番参照である可能性が高くタグとしない。
    // Numeric-only names are likely ordinal references (issue numbers etc.), not tags.
    it("excludes purely numeric names", () => {
      expect(isExcludedTagName("1")).toBe(true);
      expect(isExcludedTagName("42")).toBe(true);
      expect(isExcludedTagName("2024")).toBe(true);
    });

    it("does not exclude alphanumeric names with any letter", () => {
      expect(isExcludedTagName("v1")).toBe(false);
      expect(isExcludedTagName("tag2024")).toBe(false);
      expect(isExcludedTagName("2024年")).toBe(false);
    });

    // 6 桁 / 8 桁の純 hex はカラーコードの可能性が高い。
    // 6-/8-char pure hex is very likely a CSS color literal.
    it("excludes 6-character pure hex (CSS color)", () => {
      expect(isExcludedTagName("FF0000")).toBe(true);
      expect(isExcludedTagName("abcdef")).toBe(true);
      expect(isExcludedTagName("0A1B2C")).toBe(true);
    });

    it("excludes 8-character pure hex (CSS color with alpha)", () => {
      expect(isExcludedTagName("FF0000FF")).toBe(true);
      expect(isExcludedTagName("deadbeef")).toBe(true);
    });

    it("does not exclude 3-character hex (ambiguous, accept as tag)", () => {
      // `#abc` は 3 桁 hex 色でもあり得るがタグ名としても自然なため採用側に倒す。
      // `#abc` is ambiguous with a short CSS color; lean toward treating as a tag.
      expect(isExcludedTagName("abc")).toBe(false);
      expect(isExcludedTagName("fff")).toBe(false);
    });

    it("does not exclude 7-character alphanumeric (not a valid hex color length)", () => {
      expect(isExcludedTagName("abcdefg")).toBe(false);
      expect(isExcludedTagName("FFFFFFF")).toBe(false);
    });

    it("does not exclude names with hyphens/underscores even if otherwise hex", () => {
      expect(isExcludedTagName("abc-def")).toBe(false);
      expect(isExcludedTagName("ab_cd_ef")).toBe(false);
    });

    it("excludes empty and whitespace-only names", () => {
      expect(isExcludedTagName("")).toBe(true);
      expect(isExcludedTagName("   ")).toBe(true);
    });
  });

  describe("extractTagName", () => {
    it("returns the trimmed name without the leading `#`", () => {
      expect(extractTagName("#tech")).toBe("tech");
      expect(extractTagName("#技術")).toBe("技術");
      expect(extractTagName("#front-end")).toBe("front-end");
    });

    it("returns null when the literal is empty or has no name", () => {
      expect(extractTagName("#")).toBeNull();
      expect(extractTagName("")).toBeNull();
    });

    it("returns null when the literal does not start with `#`", () => {
      expect(extractTagName("tech")).toBeNull();
    });
  });
});

/**
 * Tests for the input-rule regex and the `addInputRules` wiring (issue #766).
 * Phase 1 (#725) only registered `addPasteRules`, so typing `#tag` directly
 * never produced the styled mark — only paste / pre-saved JSON did. The input
 * rule fixes that gap by detecting `#name` followed by a terminator char in
 * real time.
 *
 * 入力規則用正規表現と `addInputRules` 配線のテスト（issue #766）。Phase 1
 * (#725) は paste rule のみを登録していたため、エディタに `#tag` を直接
 * タイプしてもマークが付かなかった。本入力規則が `#name` + 終端文字を
 * リアルタイム検知して埋める。
 */
describe("TagExtension input rule", () => {
  describe("TAG_INPUT_REGEX", () => {
    /**
     * The regex must use exactly one capture group — `match[1]` is the
     * `#name` literal that the input-rule handler converts to a document
     * range. Exposing more captures would break the handler's index math
     * silently; test pins the contract.
     *
     * キャプチャは 1 つだけ。`match[1]` が `#name` リテラルを表し、これを
     * 元にハンドラがドキュメント範囲を計算する。誤って追加すると静かに壊れる
     * ためここで固定する。
     */
    it("captures exactly one group for the `#name` literal", () => {
      const m = "#tech ".match(TAG_INPUT_REGEX);
      expect(m).not.toBeNull();
      expect(m).toHaveLength(2); // [fullMatch, captureGroup]
      expect(m?.[1]).toBe("#tech");
    });

    it("matches `#tech ` with a space terminator", () => {
      expect("#tech ".match(TAG_INPUT_REGEX)?.[1]).toBe("#tech");
    });

    it("matches `#tech\\n` with a newline terminator", () => {
      expect("#tech\n".match(TAG_INPUT_REGEX)?.[1]).toBe("#tech");
    });

    it("matches CJK names with Japanese punctuation terminators", () => {
      // `、` / `。` のような和文句読点でも確定すること（受け入れ条件）。
      // CJK punctuation must terminate as well per acceptance criteria.
      expect("#技術、".match(TAG_INPUT_REGEX)?.[1]).toBe("#技術");
      expect("#趣味。".match(TAG_INPUT_REGEX)?.[1]).toBe("#趣味");
    });

    it("matches names with hyphens and underscores", () => {
      expect("#front-end ".match(TAG_INPUT_REGEX)?.[1]).toBe("#front-end");
      expect("#back_end ".match(TAG_INPUT_REGEX)?.[1]).toBe("#back_end");
    });

    it("matches when `#` is preceded by a non-word boundary character", () => {
      // 行中の空白直後に `#tag` をタイプしたケース。
      // Typing `#tag` after a space mid-line.
      expect("Hello #tech ".match(TAG_INPUT_REGEX)?.[1]).toBe("#tech");
    });

    it("matches at the very start of the input string", () => {
      // 段落先頭から `#tag ` をタイプしたケース。
      // Typing `#tag` at the start of a paragraph.
      expect("#intro ".match(TAG_INPUT_REGEX)?.[1]).toBe("#intro");
    });

    it("does not match `# Heading` (Markdown ATX heading)", () => {
      // `# ` は Markdown 見出しのため、タグ化対象外。
      // `# ` is a Markdown heading marker, not a tag.
      expect("# Heading".match(TAG_INPUT_REGEX)).toBeNull();
    });

    it("does not match `## Subheading` (Markdown level-2 heading)", () => {
      expect("## Subheading".match(TAG_INPUT_REGEX)).toBeNull();
    });

    it("does not match `abc#tag ` (word boundary violation)", () => {
      // 単語中の `#` はタグと見なさない（URL や ID の可能性）。
      // `#` embedded in a word is not a tag (could be a URL fragment / id).
      expect("abc#tag ".match(TAG_INPUT_REGEX)).toBeNull();
    });

    it("does not match `/page#anchor ` (slash-prefixed URL fragment)", () => {
      expect("/page#anchor ".match(TAG_INPUT_REGEX)).toBeNull();
    });

    it("terminates on common punctuation (`,.!?:;`)", () => {
      expect("#tech,".match(TAG_INPUT_REGEX)?.[1]).toBe("#tech");
      expect("#tech.".match(TAG_INPUT_REGEX)?.[1]).toBe("#tech");
      expect("#tech!".match(TAG_INPUT_REGEX)?.[1]).toBe("#tech");
      expect("#tech?".match(TAG_INPUT_REGEX)?.[1]).toBe("#tech");
      expect("#tech:".match(TAG_INPUT_REGEX)?.[1]).toBe("#tech");
      expect("#tech;".match(TAG_INPUT_REGEX)?.[1]).toBe("#tech");
    });

    it("terminates on parentheses, brackets, and quotes", () => {
      // 終端を `[^TAG_NAME_CHAR_CLASS]` まで広げたので、`(#tag)` のように
      // 括弧で囲んだ場合や引用符で閉じた場合も `)` / `"` / `'` 入力時点で
      // タグ化される（issue #769 レビュー反映）。
      // The terminator class is `[^TAG_NAME_CHAR_CLASS]`, so `(#tag)`,
      // `"#tag"`, `[#tag]` etc. all close the tag on the closing character
      // (review feedback on issue #769).
      expect("(#tag)".match(TAG_INPUT_REGEX)?.[1]).toBe("#tag");
      expect("[#tag]".match(TAG_INPUT_REGEX)?.[1]).toBe("#tag");
      expect("{#tag}".match(TAG_INPUT_REGEX)?.[1]).toBe("#tag");
      expect('"#tag"'.match(TAG_INPUT_REGEX)?.[1]).toBe("#tag");
      expect("'#tag'".match(TAG_INPUT_REGEX)?.[1]).toBe("#tag");
      expect("「#技術」".match(TAG_INPUT_REGEX)?.[1]).toBe("#技術");
    });

    it("terminates when a second `#` is typed (e.g. `#tech#design`)", () => {
      // `#` 自体も `TAG_NAME_CHAR_CLASS` に含まれないため終端扱いとなり、
      // 連続して別タグを打ち始めた瞬間に直前のタグが確定する。
      // `#` is not in `TAG_NAME_CHAR_CLASS`, so a second `#` terminates the
      // previous tag — typing back-to-back tags `#tech#design` finalises
      // `#tech` the moment the second `#` is typed.
      expect("#tech#".match(TAG_INPUT_REGEX)?.[1]).toBe("#tech");
    });

    it("does not match a `#` with no following name", () => {
      expect("# ".match(TAG_INPUT_REGEX)).toBeNull();
    });

    it("only matches the most recent `#name` segment (anchored to end)", () => {
      // 入力規則は `$` でアンカーしているので、過去に登場した `#tech ` は
      // 再マッチさせず、現在打鍵中の `#design ` だけに反応する。
      // The regex is anchored with `$`, so a previously-entered tag like
      // `#tech ` will not re-fire — only the just-completed `#design ` does.
      const m = "#tech and #design ".match(TAG_INPUT_REGEX);
      expect(m?.[1]).toBe("#design");
    });
  });

  describe("addInputRules wiring", () => {
    it("declares `addInputRules` as a function on the extension config", () => {
      const extension = Tag.configure({});
      expect(extension.config.addInputRules).toBeDefined();
      expect(typeof extension.config.addInputRules).toBe("function");
    });
  });

  describe("integration with a real Tiptap editor", () => {
    /**
     * Build a minimal editor with `StarterKit` (which contains Document,
     * Paragraph, Text, Code, and basic input rules) plus the Tag mark under
     * test. Using StarterKit instead of cherry-picked extensions keeps
     * dependencies aligned with the rest of the codebase (it is already
     * imported elsewhere) and avoids unlisted-dependency violations.
     *
     * Tag マークと StarterKit（Document / Paragraph / Text / Code を内包）で
     * 編集インスタンスを作る。本体側でも StarterKit を使っており、
     * テストの依存も合わせることで knip の unlisted dependency 検出を回避する。
     */
    function makeEditor(initialContent: string): Editor {
      return new Editor({
        extensions: [StarterKit, Tag],
        content: initialContent,
      });
    }

    /**
     * Simulate the user typing `text` at position `pos` in the editor by
     * dispatching the input-rule plugin's `handleTextInput`. Tiptap installs
     * the input-rule plugin via `addInputRules`, and ProseMirror invokes
     * `handleTextInput` for every keystroke; calling it directly is the
     * canonical way to exercise input rules in unit tests without a real
     * keyboard.
     *
     * `view.someProp("handleTextInput")` でタイプ操作を再現する。Tiptap が
     * 登録した input-rule プラグインの `handleTextInput` が呼ばれ、規則が
     * マッチすれば `tr` を組み立て自動的にディスパッチされる。
     */
    function typeAt(editor: Editor, pos: number, text: string): boolean | undefined {
      const { view } = editor;
      return view.someProp("handleTextInput", (handler) => handler(view, pos, pos, text));
    }

    it("applies the tag mark when `#tech ` is completed by a space", () => {
      // 段落 `#tech` の末尾（pos = 6）に空白をタイプしたシナリオ。
      // Paragraph contains `#tech`; user types a space at end (pos 6).
      const editor = makeEditor("<p>#tech</p>");
      try {
        const handled = typeAt(editor, 6, " ");
        expect(handled).toBe(true);
        const html = editor.getHTML();
        expect(html).toContain('data-name="tech"');
        expect(html).toContain("data-tag");
      } finally {
        editor.destroy();
      }
    });

    it("applies the tag mark when `(#tag)` is closed with a `)`", () => {
      // 括弧で囲んだケース：`(#tag` の後に `)` を打鍵すると `#tag` がタグ化。
      // Closing `)` after `(#tag` finalises the tag — review feedback on #769.
      const editor = makeEditor("<p>(#tag</p>");
      try {
        const handled = typeAt(editor, 6, ")");
        expect(handled).toBe(true);
        const html = editor.getHTML();
        expect(html).toContain('data-name="tag"');
        expect(html).toContain("data-tag");
      } finally {
        editor.destroy();
      }
    });

    it("applies the tag mark for `#技術、` with a Japanese punctuation terminator", () => {
      // 和文句読点 `、` で確定するケース（受け入れ条件）。
      // Acceptance criterion: `、` finalises CJK tag names.
      const editor = makeEditor("<p>#技術</p>");
      try {
        const handled = typeAt(editor, 4, "、");
        expect(handled).toBe(true);
        const html = editor.getHTML();
        expect(html).toContain('data-name="技術"');
        expect(html).toContain("data-tag");
      } finally {
        editor.destroy();
      }
    });

    it("does not mark numeric-only `#1 ` (delegates to `isExcludedTagName`)", () => {
      const editor = makeEditor("<p>#1</p>");
      try {
        const handled = typeAt(editor, 3, " ");
        // 入力規則がリジェクトする → ProseMirror のデフォルト挿入に委ねる。
        // Rule rejects → handler returns null → no plugin claims the input.
        expect(handled).toBeFalsy();
        const html = editor.getHTML();
        expect(html).not.toContain("data-tag");
      } finally {
        editor.destroy();
      }
    });

    it("does not mark 6-char hex `#aabbcc ` (CSS color heuristic)", () => {
      const editor = makeEditor("<p>#aabbcc</p>");
      try {
        const handled = typeAt(editor, 8, " ");
        expect(handled).toBeFalsy();
        const html = editor.getHTML();
        expect(html).not.toContain("data-tag");
      } finally {
        editor.destroy();
      }
    });

    it("does not mark 8-char hex `#aabbccdd ` (CSS color with alpha)", () => {
      const editor = makeEditor("<p>#aabbccdd</p>");
      try {
        const handled = typeAt(editor, 10, " ");
        expect(handled).toBeFalsy();
        const html = editor.getHTML();
        expect(html).not.toContain("data-tag");
      } finally {
        editor.destroy();
      }
    });

    it("does not mark a Markdown heading `# Heading`", () => {
      // 裸の `#` のあとに空白を打鍵しても、タグ規則は `#` 直後に最低 1 文字の
      // 名前を要求するため発火しない。StarterKit の heading 入力規則が代わりに
      // 反応する可能性があるが、本テストはあくまで「タグマークが付かない」
      // ことだけを保証する。
      // Bare `#` followed by space must not produce a tag mark — the regex
      // demands at least one name character after `#`. StarterKit's heading
      // input rule may fire instead, but we only assert that no `data-tag`
      // appears in the result (the heading transform is StarterKit's concern).
      const editor = makeEditor("<p>#</p>");
      try {
        typeAt(editor, 2, " ");
        const html = editor.getHTML();
        expect(html).not.toContain("data-tag");
      } finally {
        editor.destroy();
      }
    });

    it("does not mark `abc#tag ` (word-boundary violation)", () => {
      const editor = makeEditor("<p>abc#tag</p>");
      try {
        const handled = typeAt(editor, 8, " ");
        expect(handled).toBeFalsy();
        const html = editor.getHTML();
        expect(html).not.toContain("data-tag");
      } finally {
        editor.destroy();
      }
    });

    it("does not mark `#tag` typed inside an inline code mark", () => {
      // `code` マークと共存させない (`excludes: "code"`) ため、コード内では
      // タグマークが付与されないことを確認する。
      // Tags must not appear inside inline code (`excludes: "code"`).
      const editor = makeEditor("<p><code>#tag</code></p>");
      try {
        const handled = typeAt(editor, 6, " ");
        // 規則そのものはマッチしないか、衝突マークを検知して null を返す。
        // 結果として `data-tag` 属性が文書に現れないことが本テストの保証。
        // Either the rule does not match inside code or the handler skips
        // due to mark exclusion; either way no `data-tag` should appear.
        expect(handled).toBeFalsy();
        const html = editor.getHTML();
        expect(html).not.toContain("data-tag");
      } finally {
        editor.destroy();
      }
    });

    it("preserves the user-typed terminator after applying the mark", () => {
      // `markInputRule` は終端文字を削除してしまうため独自ハンドラを使った。
      // 終端文字（空白）が消えていないことを後置確認する。
      // Our custom handler intentionally avoids `markInputRule` so the
      // terminator the user just typed stays in the doc — verify it.
      const editor = makeEditor("<p>#tech</p>");
      try {
        typeAt(editor, 6, " ");
        const text = editor.state.doc.textContent;
        // `#tech ` のままで、末尾空白が削除されていないこと。
        expect(text).toBe("#tech ");
      } finally {
        editor.destroy();
      }
    });
  });
});

describe("Tag extension configuration", () => {
  it("has addPasteRules defined", () => {
    const extension = Tag.configure({});
    expect(extension.config.addPasteRules).toBeDefined();
    expect(typeof extension.config.addPasteRules).toBe("function");
  });

  it("keeps existing functionality (parseHTML, renderHTML, addAttributes)", () => {
    const extension = Tag.configure({});
    expect(extension.config.parseHTML).toBeDefined();
    expect(extension.config.renderHTML).toBeDefined();
    expect(extension.config.addAttributes).toBeDefined();
  });

  describe("targetId attribute (issue #737)", () => {
    // 重複タイトル下でリネームを ID 一致で識別するため、tag マークに `targetId`
    // 属性を追加した（issue #737 / 案 A）。本テスト群は属性宣言が正しい既定値
    // と HTML ラウンドトリップを持つことを固定する。
    // Pin the schema for the new `targetId` attribute used by rename
    // propagation to discriminate same-title pages (issue #737, approach A).
    function getTargetIdSpec(): {
      default: unknown;
      parseHTML: (el: HTMLElement) => unknown;
      renderHTML: (attrs: Record<string, unknown>) => Record<string, unknown>;
    } {
      const extension = Tag.configure({});
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
