import i18n from "@/i18n";
import { PageContext, ReferencedPage } from "../types/aiChat";
import type { McpServerEntry } from "../types/mcp";
import { getAiChatActionFormatBlock } from "./aiChatPromptActionFormat";

/**
 * ページタイトル行（既存ページ一覧）を組み立てる。
 * Builds the bullet list of existing page titles.
 */
function buildExistingPageList(titles: string[]): string {
  return titles.map((x) => `- ${x}`).join("\n");
}

/**
 * エディタ等の現在コンテキスト節を `t` で組み立てる。
 * Builds the “current context” section for editor / home / search.
 */
function buildContextSection(context: PageContext): string {
  const t = i18n.getFixedT(i18n.language);
  let section = `${t("aiPrompt.context.section")}\n`;

  switch (context.type) {
    case "editor": {
      const title = context.pageTitle || t("common.untitledPage");
      section += `${t("aiPrompt.context.editor", { title })}\n`;
      if (context.pageContent) {
        section += `\n${t("aiPrompt.context.pageBody")}\n${context.pageContent}\n`;
      }
      break;
    }
    case "home": {
      section += `${t("aiPrompt.context.home")}\n`;
      if (context.recentPageTitles && context.recentPageTitles.length > 0) {
        section += `\n${t("aiPrompt.context.recentPages")}\n${context.recentPageTitles.map((x) => `- ${x}`).join("\n")}\n`;
      }
      break;
    }
    case "search":
      section += `${t("aiPrompt.context.search", { query: context.searchQuery || "" })}\n`;
      break;
    default:
      section += `${t("aiPrompt.context.other")}\n`;
  }

  return section;
}

/**
 * 参照ページ節（存在時のみ）。Referenced pages block (only when non-empty).
 */
function buildReferencedPagesSection(referencedPages: ReferencedPage[]): string {
  if (referencedPages.length === 0) return "";
  const t = i18n.getFixedT(i18n.language);
  let section = `\n${t("aiPrompt.referenced.section")}\n`;
  section += `${t("aiPrompt.referenced.intro")}\n`;
  for (const page of referencedPages) {
    section += `\n### ${page.title}\n${t("aiPrompt.referenced.pageIdLine", { id: page.id })}\n`;
  }
  return section;
}

/**
 * 有効な MCP サーバー節。Enabled MCP servers block.
 */
function buildMcpSection(mcpServers: McpServerEntry[]): string {
  const enabled = mcpServers.filter((s) => s.enabled);
  if (enabled.length === 0) return "";
  const t = i18n.getFixedT(i18n.language);

  let section = `\n${t("aiPrompt.mcp.section")}\n`;
  section += `${t("aiPrompt.mcp.intro")}\n`;
  section += `${t("aiPrompt.mcp.notation")}\n\n`;

  for (const server of enabled) {
    section += `- **${server.name}**`;
    if (server.tools && server.tools.length > 0) {
      const toolNames = server.tools.map((x) => x.name).join(", ");
      section += ` (${t("aiPrompt.mcp.toolsPrefix")} ${toolNames})`;
    }
    if (server.status === "connected") {
      section += ` ${t("aiPrompt.mcp.connected")}`;
    }
    section += "\n";
  }

  return section;
}

/**
 * システム本文（役割・ガイドライン・既存タイトル説明）を `t` で連結。
 * System body: role, guidelines, existing-page list intro/footer.
 */
function buildSystemCore(existingPageTitles: string[]): string {
  const t = i18n.getFixedT(i18n.language);
  const list = buildExistingPageList(existingPageTitles);
  return `${t("aiPrompt.system.intro")}

${t("aiPrompt.system.role")}
${t("aiPrompt.system.role1")}
${t("aiPrompt.system.role2")}
${t("aiPrompt.system.role3")}

${t("aiPrompt.system.guidelines")}
${t("aiPrompt.system.gl1")}
${t("aiPrompt.system.gl2")}
${t("aiPrompt.system.gl3")}

${getAiChatActionFormatBlock(i18n.language)}

${t("aiPrompt.system.existingCoop")}
${t("aiPrompt.system.existingListLabel")}
${list}

${t("aiPrompt.system.existingListFooter")}

`;
}

/**
 * 現在のコンテキスト・既存ページ・参照・MCP から AI チャット用システムプロンプトを返す。
 * Returns the full AI chat system prompt.
 */
export function buildSystemPrompt(
  context: PageContext | null,
  existingPageTitles: string[],
  referencedPages: ReferencedPage[] = [],
  mcpServers: McpServerEntry[] = [],
): string {
  const core = buildSystemCore(existingPageTitles);
  return `${core}${context ? buildContextSection(context) : ""}${buildReferencedPagesSection(referencedPages)}${buildMcpSection(mcpServers)}`;
}
