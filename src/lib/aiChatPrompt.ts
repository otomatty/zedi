import { PageContext, ReferencedPage } from "../types/aiChat";
import type { McpServerEntry } from "../types/mcp";

function buildContextSection(context: PageContext): string {
  let section = "## 現在のコンテキスト\n";

  switch (context.type) {
    case "editor":
      section += `ユーザーは現在「${context.pageTitle || "無題のページ"}」を編集/閲覧しています。\n`;
      if (context.pageContent) {
        section += `\n### ページ内容:\n${context.pageContent}\n`;
      }
      break;
    case "home":
      section += "ユーザーは現在ホーム画面にいます。\n";
      if (context.recentPageTitles && context.recentPageTitles.length > 0) {
        section += `\n### 最近のページ:\n${context.recentPageTitles.map((t) => `- ${t}`).join("\n")}\n`;
      }
      break;
    case "search":
      section += `ユーザーは現在「${context.searchQuery || ""}」で検索を行っています。\n`;
      break;
    default:
      section += "特定のページコンテキストはありません。\n";
  }

  return section;
}

function buildReferencedPagesSection(referencedPages: ReferencedPage[]): string {
  if (referencedPages.length === 0) return "";
  let section = "\n## 参照ページ\n";
  section +=
    "ユーザーが以下のページをAIチャットの参照として追加しています。これらのページの情報を踏まえて回答してください。\n";
  for (const page of referencedPages) {
    section += `\n### ${page.title}\n(ページID: ${page.id})\n`;
  }
  return section;
}

/**
 * 有効な MCP サーバー情報をシステムプロンプトに含めるセクションを構築する。
 * Builds a section describing enabled MCP servers for the system prompt.
 */
function buildMcpSection(mcpServers: McpServerEntry[]): string {
  const enabled = mcpServers.filter((s) => s.enabled);
  if (enabled.length === 0) return "";

  let section = "\n## MCP 連携\n";
  section +=
    "以下の MCP サーバーが接続されています。ユーザーが外部サービスのデータを参照・操作したい場合は、対応する MCP ツールを使用してください。\n";
  section +=
    "ユーザーが `@mcp:サーバー名/リソース` のような記法を使った場合は、該当する MCP サーバーのツールでデータを取得してください。\n\n";

  for (const server of enabled) {
    section += `- **${server.name}**`;
    if (server.tools && server.tools.length > 0) {
      const toolNames = server.tools.map((t) => t.name).join(", ");
      section += ` (ツール: ${toolNames})`;
    }
    if (server.status === "connected") {
      section += " [接続済み]";
    }
    section += "\n";
  }

  return section;
}

/**
 * 現在のコンテキスト・既存ページ・参照ページ・（Claude Code 向け）MCP サーバー一覧から
 * AI チャット用のシステムプロンプト文字列を組み立てる。
 * Builds the AI chat system prompt from context, pages, references, and optional MCP servers.
 */
export function buildSystemPrompt(
  context: PageContext | null,
  existingPageTitles: string[],
  referencedPages: ReferencedPage[] = [],
  mcpServers: McpServerEntry[] = [],
): string {
  return `
あなたは Zedi のAIアシスタントです。
Zedi はナレッジネットワークツールで、ユーザーの思考を[[WikiLink]]で繋がったページに整理します。

## あなたの役割
- ユーザーとの対話を通じて、思考を明確化する手助けをする
- 適切なタイミングで、会話内容をページとして整理することを提案する
- 既存のページとの関連（WikiLink）を見つけて提案する

## 応答ガイドライン
- ユーザーの言語に合わせて応答する
- Markdown形式で回答する
- 簡潔で実用的な回答を心がける

## アクション提案のフォーマット（必須）
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

## 既存ページとの連携
ユーザーの既存ページタイトル一覧:
${existingPageTitles.map((t) => `- ${t}`).join("\n")}

上記のタイトルに関連するキーワードが会話に出た場合、suggest-wiki-links で[[WikiLink]]として参照できることを提案してください。

${context ? buildContextSection(context) : ""}
${buildReferencedPagesSection(referencedPages)}
${buildMcpSection(mcpServers)}
`;
}
