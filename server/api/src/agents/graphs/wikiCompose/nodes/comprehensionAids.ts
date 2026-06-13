/**
 * `comprehension_aids` — Wiki Compose Understanding Layer node.
 *
 * ドラフト済みセクションから、読者の理解度を高めるスキャフォールドを生成する:
 * TL;DR 要約・キーワード用語集・自己確認用の理解度チェック質問。生成は
 * 非ブロッキングで、失敗してもフロー全体は止めない（`completed` 前に走り、
 * `completion` に同梱される）。
 *
 * Builds the Understanding Layer from the drafted sections: a TL;DR summary, a
 * key-term glossary, and a few self-check questions. Generation is best-effort
 * and never aborts the run — on any failure the node returns `null` aids.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";
import { composeContentLocaleInstruction } from "../../../core/composeLocale.js";
import { createZediChatModel } from "../../../core/llm/modelFactory.js";
import { resolveWikiComposeModelId } from "../../../core/llm/wikiComposeModelId.js";
import { getGraphContext } from "../../../subgraphs/research/nodes/shared/getGraphContext.js";
import type { WikiComposeStateType, WikiComposeStateUpdate } from "../state.js";
import type { ComprehensionAids, DraftedSection } from "../types.js";

/** Structured-output schema for the comprehension aids LLM call. */
export const comprehensionAidsSchema = z.object({
  summary: z.string().min(1).max(800),
  keyTerms: z
    .array(
      z.object({
        term: z.string().min(1).max(80),
        definition: z.string().min(1).max(400),
      }),
    )
    // Bounds mirror the system prompt (3–6 terms) so schema and instructions agree.
    .max(6)
    .default([]),
  // Bounds mirror the system prompt (2–4 questions).
  questions: z.array(z.string().min(1).max(300)).max(4).default([]),
});

const SYSTEM_PROMPT =
  "You are a learning designer. Given a wiki article, produce aids that help a " +
  "reader genuinely understand it. Return JSON with:\n" +
  "1. `summary`: a single concise TL;DR paragraph (2–4 sentences) capturing the " +
  "core idea.\n" +
  "2. `keyTerms`: 3–6 important terms/concepts from the article, each with a " +
  "short plain-language definition. Skip if the article is trivially short.\n" +
  "3. `questions`: 2–4 self-check questions that test comprehension of the main " +
  "points (active recall). Do NOT include answers.\n" +
  "Base everything strictly on the provided article; do not invent facts.";

/** Join the drafted section bodies into a single article excerpt for the prompt. */
function buildArticleExcerpt(sections: DraftedSection[]): string {
  const parts: string[] = [];
  for (const s of sections) {
    if (!s.body.trim()) continue;
    parts.push(`## ${s.heading}\n\n${s.body.trim()}`);
  }
  return parts.join("\n\n").slice(0, 8000);
}

/**
 * `comprehension_aids` node — derives the Understanding Layer from the draft.
 */
export async function comprehensionAids(
  state: WikiComposeStateType,
  config: LangGraphRunnableConfig,
): Promise<WikiComposeStateUpdate> {
  const sections = state.draftedSections;
  const excerpt = buildArticleExcerpt(sections);
  if (!excerpt.trim()) {
    // Nothing drafted (e.g. all sections failed) — skip cleanly.
    return { comprehensionAids: null };
  }

  try {
    const ctx = getGraphContext(config);
    const modelId = await resolveWikiComposeModelId("orchestrator", ctx.tier, ctx.db);
    const model = await createZediChatModel({
      modelId,
      userId: ctx.userId,
      tier: ctx.tier,
      db: ctx.db,
      feature: `${ctx.feature}:comprehension`,
      backend: ctx.backend,
      temperature: 0.3,
      maxTokens: 1024,
    });
    const structured = model.withStructuredOutput(comprehensionAidsSchema, {
      name: "comprehension_aids",
    });
    const pageTitle = state.pageSnapshot?.title ?? "(untitled)";
    const raw = await structured.invoke([
      {
        role: "system",
        content: SYSTEM_PROMPT + composeContentLocaleInstruction(ctx.contentLocale),
      },
      {
        role: "user",
        content: `[Article title]\n${pageTitle}\n\n[Article]\n${excerpt}`,
      },
    ]);

    const aids: ComprehensionAids = {
      summary: raw.summary,
      keyTerms: (raw.keyTerms ?? []).map((k) => ({ term: k.term, definition: k.definition })),
      questions: raw.questions ?? [],
    };
    return { comprehensionAids: aids };
  } catch (err) {
    // Non-fatal: the article is the primary output; aids are an enhancement.
    // 失敗しても本文が主成果物なので止めない。
    console.error("[comprehensionAids] generation failed:", err);
    return { comprehensionAids: null };
  }
}
