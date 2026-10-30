import { marked, type Token, type Tokens } from "marked";

// Root-relative paths only: `//host` and `/\host` (browsers read `\` as `/`) leave the site.
const SAFE_URL = /^(?:https?:|mailto:|\/(?![/\\])|#)/i;

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  return SAFE_URL.test(trimmed) ? trimmed : null;
}

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  el.append(...children);
  return el;
}

function inline(doc: Document, tokens: Token[] | undefined): Node[] {
  return (tokens ?? []).flatMap((token): Node[] => {
    switch (token.type) {
      case "text":
        return "tokens" in token && token.tokens
          ? inline(doc, token.tokens)
          : [doc.createTextNode(token.text)];
      case "escape":
      case "html": // raw HTML is shown as text, never parsed
        return [doc.createTextNode(token.text)];
      case "strong":
        return [element(doc, "strong", inline(doc, token.tokens))];
      case "em":
        return [element(doc, "em", inline(doc, token.tokens))];
      case "del":
        return [element(doc, "del", inline(doc, token.tokens))];
      case "codespan":
        return [element(doc, "code", [doc.createTextNode(token.text)])];
      case "br":
        return [doc.createElement("br")];
      case "link":
      case "image": {
        const href = safeHref((token as Tokens.Link).href);
        const children =
          token.type === "image" ? [doc.createTextNode(token.text)] : inline(doc, token.tokens);
        if (!href) return children;
        const a = element(doc, "a", children);
        a.setAttribute("href", href);
        a.setAttribute("rel", "noopener noreferrer");
        a.setAttribute("target", "_blank");
        return [a];
      }
      default:
        return "text" in token && typeof token.text === "string"
          ? [doc.createTextNode(token.text)]
          : [];
    }
  });
}

function listItem(doc: Document, item: Tokens.ListItem): HTMLLIElement {
  const li = doc.createElement("li");
  if (item.task) {
    const box = doc.createElement("input");
    box.setAttribute("type", "checkbox");
    box.setAttribute("disabled", "");
    if (item.checked) box.setAttribute("checked", "");
    li.append(box);
  }
  const content = item.tokens.filter((t) => t.type !== "checkbox");
  // Tight list items hold inline `text` tokens; loose ones hold paragraphs and nested blocks.
  li.append(
    ...(item.loose
      ? blocks(doc, content)
      : content.flatMap((t) => (t.type === "text" ? inline(doc, [t]) : blocks(doc, [t])))),
  );
  return li;
}

function table(doc: Document, token: Tokens.Table): HTMLTableElement {
  const cell = (tag: "th" | "td", c: Tokens.TableCell) => {
    const el = element(doc, tag, inline(doc, c.tokens));
    if (c.align) el.style.textAlign = c.align;
    return el;
  };
  const head = element(doc, "thead", [
    element(
      doc,
      "tr",
      token.header.map((c) => cell("th", c)),
    ),
  ]);
  const body = element(
    doc,
    "tbody",
    token.rows.map((row) =>
      element(
        doc,
        "tr",
        row.map((c) => cell("td", c)),
      ),
    ),
  );
  return element(doc, "table", [head, body]);
}

function blocks(doc: Document, tokens: Token[]): Node[] {
  return tokens.flatMap((token): Node[] => {
    switch (token.type) {
      case "space":
      case "def":
        return [];
      case "heading": {
        const level = Math.min(Math.max(token.depth, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
        return [element(doc, `h${level}`, inline(doc, token.tokens))];
      }
      case "paragraph":
        return [element(doc, "p", inline(doc, token.tokens))];
      case "code": {
        const code = element(doc, "code", [doc.createTextNode(token.text)]);
        const lang = (token.lang ?? "").trim().split(/\s+/)[0];
        if (lang) code.className = `language-${lang}`;
        return [element(doc, "pre", [code])];
      }
      case "blockquote":
        return [element(doc, "blockquote", blocks(doc, token.tokens ?? []))];
      case "hr":
        return [doc.createElement("hr")];
      case "list": {
        const list = element(
          doc,
          token.ordered ? "ol" : "ul",
          token.items.map((item: Tokens.ListItem) => listItem(doc, item)),
        );
        if (token.ordered && token.start !== "" && token.start !== 1)
          list.setAttribute("start", String(token.start));
        return [list];
      }
      case "table":
        return [table(doc, token as Tokens.Table)];
      case "html":
        return [element(doc, "p", [doc.createTextNode(token.text.trim())])];
      case "text":
        return [element(doc, "p", inline(doc, "tokens" in token ? token.tokens : undefined))];
      default:
        return [];
    }
  });
}

/**
 * Renders Markdown (GFM) to DOM nodes from marked's tokens. No HTML string is ever parsed:
 * raw HTML is shown as text and only http(s)/mailto/relative links are kept, so the output
 * is safe without a sanitizer.
 * marked のトークンから DOM を直接組み立てる。HTML 文字列を解釈しないためサニタイザ不要。
 */
export function renderMarkdown(src: string, doc: Document = document): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  fragment.append(...blocks(doc, marked.lexer(src)));
  return fragment;
}
