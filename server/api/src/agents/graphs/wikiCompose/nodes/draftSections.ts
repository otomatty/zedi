/**
 * `draft_sections` — Wiki Compose Draft phase node (#950).
 *
 * 承認済みアウトラインの各セクションを LLM ストリーミングで本文化する。
 * セクションごとに `compose_section { status: "started" }` を発火し、LLM の
 * `streamEvents` 経由でトークンが SSE `token` イベントとして流れる
 * （`sseMapper.mapChatModelStream` が拾う）。1 セクション完了ごとに
 * `compose_section { status: "completed" }` を出し、`draftedSections` に追記する。
 *
 * Sequential per-section streaming: each section is streamed as a single
 * `stream()` call so the SSE wire produces a `token` event per chunk under
 * the `draft_sections` node label, which the frontend uses to incrementally
 * paint into the EditorPane.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { composeContentLocaleInstruction } from "../../../core/composeLocale.js";
import { createZediChatModel } from "../../../core/llm/modelFactory.js";
import { resolveWikiComposeModelId } from "../../../core/llm/wikiComposeModelId.js";
import { getGraphContext } from "../../../subgraphs/research/nodes/shared/getGraphContext.js";
import { dispatchComposePhase, dispatchComposeSection } from "./shared/dispatch.js";
import type { WikiComposeStateType, WikiComposeStateUpdate } from "../state.js";
import type { DraftedSection, OutlineSection, Source } from "../types.js";

const SECTION_SYSTEM_PROMPT =
  "You are a co-author writing one section of a wiki article. Constraints:\n" +
  "1. Output Markdown body ONLY — do NOT repeat the heading line.\n" +
  "2. Stay focused on the section's intent. Do not introduce content that " +
  "belongs to a sibling section.\n" +
  "3. Cite sources inline as `[#N]` referring to the numbered approved " +
  "research list. Only cite sources that genuinely support the claim.\n" +
  "4. Aim for ~250–500 words. Use sub-headings only when depth=2 is " +
  "specified for sub-sections within the same draft pass.\n" +
  "5. Plain Markdown; no HTML, no YAML frontmatter.";

function numberedSourceList(sources: Source[], allowedIds?: string[]): string[] {
  const allow = allowedIds && allowedIds.length > 0 ? new Set(allowedIds) : null;
  return sources
    .filter((s) => !allow || allow.has(s.id))
    .map((s, i) => {
      const tag = s.kind.toUpperCase();
      const url = s.finalUrl ?? s.url ?? "";
      const blurb = s.excerpt ?? s.snippet ?? "";
      const tail = blurb ? `\n   ${blurb.slice(0, 240)}` : "";
      return `[#${i + 1}] (${tag}) ${s.title}${url ? ` — ${url}` : ""}${tail}`;
    });
}

function buildSectionPrompt(args: {
  pageTitle: string;
  section: OutlineSection;
  outline: OutlineSection[];
  briefSummary: string;
  sources: Source[];
}): string {
  const { pageTitle, section, outline, briefSummary, sources } = args;
  const outlineList = outline.map((s) => {
    const indent = "  ".repeat(Math.max(0, s.depth - 1));
    const marker = s.id === section.id ? "→" : "•";
    return `${indent}${marker} ${s.heading} — ${s.intent}`;
  });
  const sourceLines = numberedSourceList(sources, section.sourceIds);
  return [
    `[Page title]`,
    pageTitle,
    "",
    "[Brief summary]",
    briefSummary,
    "",
    "[Full outline — '→' marks the section you are writing]",
    ...outlineList,
    "",
    "[Section to write]",
    `heading: ${section.heading}`,
    `depth: ${section.depth}`,
    `intent: ${section.intent}`,
    "",
    `[Approved sources (${sourceLines.length})]`,
    ...(sourceLines.length > 0 ? sourceLines : ["(no sources — write conservatively)"]),
  ].join("\n");
}

/**
 * Sum the chunks of a streamed chat result into a single string. We rely on
 * the LangGraph runtime to also emit each chunk as an `on_chat_model_stream`
 * event so the SSE mapper produces `token` events the frontend reads.
 *
 * ストリーミングの最終結果を 1 本の文字列にまとめる。途中チャンクは
 * runtime が `on_chat_model_stream` event として吐くので、SSE には別経路で
 * `token` event が流れる。
 */
function chunkContent(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return "";
  const content = (chunk as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

/** `draft_sections` node — sequential per-section LLM streaming. */
export async function draftSections(
  state: WikiComposeStateType,
  config: LangGraphRunnableConfig,
): Promise<WikiComposeStateUpdate> {
  const ctx = getGraphContext(config);

  await dispatchComposePhase({ phase: "draft", status: "entered" }, config);

  const outline = state.approvedOutline?.sections ?? [];
  if (outline.length === 0) {
    // Defensive: humanReviewOutline already rejects empty arrays, but if we
    // somehow arrive here with nothing to write, skip Draft cleanly.
    // 通常は到達不能だが防御。空アウトラインなら Draft をスキップ。
    return { draftedSections: [], phase: "draft:completed" };
  }

  const modelId = await resolveWikiComposeModelId("draft", ctx.tier, ctx.db);
  const model = await createZediChatModel({
    modelId,
    userId: ctx.userId,
    tier: ctx.tier,
    db: ctx.db,
    feature: `${ctx.feature}:draft`,
    backend: ctx.backend,
    temperature: 0.6,
    maxTokens: 2048,
  });

  const pageTitle = state.pageSnapshot?.title ?? "(untitled)";
  const briefSummary = state.brief?.summary ?? "(no brief)";
  const drafted: DraftedSection[] = [];

  for (let i = 0; i < outline.length; i++) {
    const section = outline[i] as OutlineSection;
    await dispatchComposeSection(
      {
        sectionId: section.id,
        heading: section.heading,
        status: "started",
        index: i + 1,
        total: outline.length,
      },
      config,
    );

    let body = "";
    try {
      const stream = await model.stream([
        {
          role: "system",
          content: SECTION_SYSTEM_PROMPT + composeContentLocaleInstruction(ctx.contentLocale),
        },
        {
          role: "user",
          content: buildSectionPrompt({
            pageTitle,
            section,
            outline,
            briefSummary,
            sources: state.approvedResearch,
          }),
        },
      ]);
      for await (const chunk of stream) {
        body += chunkContent(chunk);
      }
    } catch (err) {
      // Per-section failure must not abort the whole Draft. Surface the
      // failure as an inline note inside the section body so the user sees
      // what happened without losing earlier sections.
      // セクション 1 件の失敗で Draft 全体を止めない。エラーは本文に追記。
      const message = err instanceof Error ? err.message : String(err);
      body = body || `*(Section draft failed: ${message})*`;
    }

    const citedIds = collectCitedSourceIds(body, state.approvedResearch, section.sourceIds);
    drafted.push({
      sectionId: section.id,
      heading: section.heading,
      body: body.trim(),
      citedSourceIds: citedIds,
      completedAt: new Date().toISOString(),
    });

    await dispatchComposeSection(
      {
        sectionId: section.id,
        heading: section.heading,
        status: "completed",
        index: i + 1,
        total: outline.length,
      },
      config,
    );
  }

  return {
    draftedSections: drafted,
    phase: "draft:completed",
  };
}

/**
 * Best-effort extraction of cited source ids from `[#N]` markers in the body.
 * Maps each `[#N]` back to the corresponding source by 1-based index over the
 * allowed-source subset.
 *
 * 本文中の `[#N]` 形式の引用マーカーから citedSourceIds を抽出する。
 */
function collectCitedSourceIds(
  body: string,
  sources: Source[],
  allowedIds: string[] | undefined,
): string[] {
  const allow = allowedIds && allowedIds.length > 0 ? new Set(allowedIds) : null;
  const candidates = sources.filter((s) => !allow || allow.has(s.id));
  const matches = new Set<string>();
  for (const m of body.matchAll(/\[#(\d+)\]/g)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1 || n > candidates.length) continue;
    const candidate = candidates[n - 1];
    if (candidate) matches.add(candidate.id);
  }
  return Array.from(matches);
}
