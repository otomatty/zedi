import { PageContext, ReferencedPage } from "../types/aiChat";

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

export function buildSystemPrompt(
  context: PageContext | null,
  existingPageTitles: string[],
  referencedPages: ReferencedPage[] = [],
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

## ページ作成の提案
会話の中で十分な情報が蓄積されたと判断した場合、以下のフォーマットでページ作成を提案してください:

<!-- zedi-action:create-page -->
{"type":"create-page","title":"ページタイトル","content":"Markdown内容...","suggestedLinks":["関連キーワード"],"reason":"提案理由"}
<!-- /zedi-action -->

提案のタイミング:
- ユーザーが特定のトピックについて詳しく説明した後
- 議論が一区切りついた時
- ユーザーが「まとめて」「記録して」等の意図を示した時
- 複数のトピックが出た場合は create-multiple-pages を使用

## 既存ページとの連携
ユーザーの既存ページタイトル一覧:
${existingPageTitles.map((t) => `- ${t}`).join("\n")}

上記のタイトルに関連するキーワードが会話に出た場合、[[WikiLink]]として参照できることを提案してください。

${context ? buildContextSection(context) : ""}
${buildReferencedPagesSection(referencedPages)}
`;
}
