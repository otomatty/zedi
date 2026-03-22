/**
 * Prompt template for generating full page Markdown from chat outline + conversation.
 * Wiki generator quality guidelines are inlined in a compact form.
 */

export /**
 *
 */
const CHAT_PAGE_WIKI_PROMPT_TEMPLATE = `あなたは百科事典風の解説記事を執筆する専門家です。以下の**ページタイトル**について、ユーザーが承認した**アウトライン**に沿い、**会話の文脈**を踏まえて、包括的なMarkdown記事を1本書いてください。

## ページタイトル
{{title}}

## ユーザーが承認したアウトライン（必ずこの構成を反映すること）
{{outline}}

## 会話の文脈（事実・トーン・用語の参考にする。会話文をそのまま貼り付けないこと）
{{conversation}}

## 執筆ルール
- 出力は**Markdownのみ**（前置きや「以下に」などのメタ文は不要）。
- 導入部でトピックを定義し、見出し（## / ###）でアウトラインの各点を展開する。
- 必要に応じて Zedi の [[WikiLink]] 記法で関連語をリンクする。
- ユーザーの言語で書く（会話の言語に合わせる）。

では記事本文を生成してください。`;

/**
 *
 */
export function buildChatPageWikiUserPrompt(
  title: string,
  outline: string,
  conversation: string,
): string {
  return CHAT_PAGE_WIKI_PROMPT_TEMPLATE.replace("{{title}}", title)
    .replace("{{outline}}", outline || "(アウトラインなし)")
    .replace("{{conversation}}", conversation || "(会話なし)");
}
