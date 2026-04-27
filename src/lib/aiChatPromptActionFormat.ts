/**
 * AI チャット用「アクション提案のフォーマット」節。モデル解釈の一貫性のため
 * 日本語・英語の全文を定数で保持する。
 * The action-proposal block for AI chat, kept in full strings per locale for model consistency.
 */
export const AI_CHAT_ACTION_FORMAT_JA = `## アクション提案のフォーマット（必須）
提案するときは、応答本文の末尾に以下のいずれかのブロックを必ず1行のJSONで含めてください。コメントのタグは正確に書いてください。
JSON文字列の値に改行・ダブルクォート・バックスラッシュを含める場合は、必ず "\\n"、バックスラッシュ + ダブルクォート、"\\\\" にエスケープしてください。

(1) 新規ページ1件の提案:
<!-- zedi-action:create-page -->
{"type":"create-page","title":"ページタイトル","content":"Markdown内容...","suggestedLinks":["関連キーワード"],"reason":"提案理由"}
<!-- /zedi-action -->

(2) 現在開いているページへの追記提案（pageTitle には現在のページタイトルを入れる）:
<!-- zedi-action:append-to-page -->
{"type":"append-to-page","pageTitle":"ページタイトル","content":"追記するMarkdown","reason":"提案理由"}
<!-- /zedi-action -->

(3) 複数ページの一括作成提案:
<!-- zedi-action:create-multiple-pages -->
{"type":"create-multiple-pages","pages":[{"title":"タイトル1","content":"内容1","suggestedLinks":[]},{"title":"タイトル2","content":"内容2","suggestedLinks":[]}],"linkStructure":[{"from":"タイトル1","to":"タイトル2"}],"reason":"提案理由"}
<!-- /zedi-action -->

(4) 現在開いているページに追加したいWikiLink提案（existingPageTitleで指定。上記タイトル一覧と一致させる）:
<!-- zedi-action:suggest-wiki-links -->
{"type":"suggest-wiki-links","links":[{"keyword":"キーワード","existingPageTitle":"既存ページのタイトル"}],"reason":"提案理由"}
<!-- /zedi-action -->

提案のタイミング:
- ユーザーが特定のトピックについて詳しく説明した後 → create-page
- 議論が一区切りついた時 → create-page
- ユーザーが「まとめて」「記録して」等の意図を示した時 → create-page または create-multiple-pages
- 既存ページに関連するキーワードが会話に出た時 → suggest-wiki-links
`;

export /**
 *
 */
const AI_CHAT_ACTION_FORMAT_EN = `## Action proposal format (required)
When you propose, include exactly one JSON line at the end of the reply, matching the comment tags below.
To embed newlines, double quotes, or backslashes inside JSON string values, escape with "\\n", a backslash before a double quote, and "\\\\" for backslashes.

(1) Propose a single new page:
<!-- zedi-action:create-page -->
{"type":"create-page","title":"Page title","content":"Markdown...","suggestedLinks":["related keywords"],"reason":"Why"}
<!-- /zedi-action -->

(2) Propose an append to the current page (put the current page title in pageTitle):
<!-- zedi-action:append-to-page -->
{"type":"append-to-page","pageTitle":"Page title","content":"Markdown to append","reason":"Why"}
<!-- /zedi-action -->

(3) Propose multiple new pages in one shot:
<!-- zedi-action:create-multiple-pages -->
{"type":"create-multiple-pages","pages":[{"title":"Title1","content":"...","suggestedLinks":[]},{"title":"Title2","content":"...","suggestedLinks":[]}],"linkStructure":[{"from":"Title1","to":"Title2"}],"reason":"Why"}
<!-- /zedi-action -->

(4) Suggest wiki links for the current page (existingPageTitle must match a title in the list above):
<!-- zedi-action:suggest-wiki-links -->
{"type":"suggest-wiki-links","links":[{"keyword":"term","existingPageTitle":"Existing page title"}],"reason":"Why"}
<!-- /zedi-action -->

When to propose:
- After the user explained a topic in detail → create-page
- When a thread reaches a good stopping point → create-page
- When the user says “capture”, “write up”, or similar → create-page or create-multiple-pages
- When keywords related to existing pages appear → suggest-wiki-links
`;

/**
 * 日本語以外は英語ブロックにフォールバック。将来の言語拡張はここで拡える。
 * Non-Japanese locales fall back to the English block for now.
 */
export function getAiChatActionFormatBlock(lng: string): string {
  if (lng === "ja" || lng.startsWith("ja")) {
    return AI_CHAT_ACTION_FORMAT_JA;
  }
  return AI_CHAT_ACTION_FORMAT_EN;
}
