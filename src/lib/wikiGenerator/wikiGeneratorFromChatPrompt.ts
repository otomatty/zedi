/**
 * Prompt template for generating full page Markdown from chat outline + conversation.
 * Wiki generator quality guidelines are inlined in a compact form.
 *
 * User-supplied title/outline/conversation are wrapped in XML-like tags and interpolated with
 * template literals (not chained String.replace on `{{...}}` placeholders) so malicious text
 * cannot inject prompt-level headings or break the fixed 「執筆ルール」 section.
 * ユーザー入力はタグで囲みテンプレート埋め込みにし、見出し注入や「執筆ルール」境界の破壊を防ぐ。
 */

/**
 * Builds the user message for chat-page wiki generation from title, outline, and conversation.
 * タイトル・アウトライン・会話から、チャット由来ページ生成用ユーザープロンプトを組み立てる。
 */
export function buildChatPageWikiUserPrompt(
  title: string,
  outline: string,
  conversation: string,
): string {
  const outlineBlock = outline || "(アウトラインなし)";
  const conversationBlock = conversation || "(会話なし)";

  return `あなたは百科事典風の解説記事を執筆する専門家です。以下の**ページタイトル**について、ユーザーが承認した**アウトライン**に沿い、**会話の文脈**を踏まえて、包括的なMarkdown記事を1本書いてください。

## ページタイトル
<page_title>
${title}
</page_title>

## ユーザーが承認したアウトライン（必ずこの構成を反映すること）
<approved_outline>
${outlineBlock}
</approved_outline>

## 会話の文脈（事実・トーン・用語の参考にする。会話文をそのまま貼り付けないこと）
<conversation_context>
${conversationBlock}
</conversation_context>

## 執筆ルール
- 出力は**Markdownのみ**（前置きや「以下に」などのメタ文は不要）。
- 導入部でトピックを定義し、見出し（## / ###）でアウトラインの各点を展開する。
- 必要に応じて Zedi の [[WikiLink]] 記法で関連語をリンクする。
- ユーザーの言語で書く（会話の言語に合わせる）。

では記事本文を生成してください。`;
}
