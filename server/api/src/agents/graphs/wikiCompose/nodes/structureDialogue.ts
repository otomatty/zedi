/**
 * `structure_dialogue` — Wiki Compose Structure phase node (#950).
 *
 * Brief 確定回答と採用調査ソースを材料に、3〜10 セクションのアウトライン
 * 案を Orchestrator LLM に生成させる。Draft フェーズが書きやすい粒度
 * （= 各セクションが独立して 1 LLM 呼びぶんに収まる）を狙う。生成後は
 * `outlineProposal` に置き、`compose_phase: { phase: "structure", status: "entered" }`
 * を発火して `human_review_outline` interrupt に進む。
 *
 * Builds an outline proposal that the user can edit before Draft. The
 * prompt is intentionally narrow on shape (heading + intent) so the
 * frontend's drag-and-drop editor has stable rows to work with.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  composeContentLocaleInstruction,
  structureDialogueFallbackOutline,
} from "../../../core/composeLocale.js";
import { createZediChatModel } from "../../../core/llm/modelFactory.js";
import { resolveComposeModelId } from "../../../core/llm/resolveComposeModelId.js";
import { getGraphContext } from "../../../subgraphs/research/nodes/shared/getGraphContext.js";
import { dispatchComposePhase } from "./shared/dispatch.js";
import type { WikiComposeStateType, WikiComposeStateUpdate } from "../state.js";
import type { OutlineSection } from "../types.js";

/**
 * Structured output schema. 3..10 sections, depth 1..3, each with a short
 * intent so the user can spot redundant or off-topic items at a glance.
 */
export const outlineProposalSchema = z.object({
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(120),
        depth: z.number().int().min(1).max(3).default(1),
        intent: z.string().min(1).max(280),
      }),
    )
    .min(3)
    .max(10),
});

const SYSTEM_PROMPT =
  "You are the orchestrator for Wiki Compose. Produce a section outline for " +
  "the wiki page based on the Brief answers and the approved research " +
  "sources. Constraints:\n" +
  "1. 3..10 sections. Each MUST be writable in a single ~600-word pass.\n" +
  "2. Use depth=1 for top-level h2 sections, depth=2 for h3 sub-sections.\n" +
  "3. Each section MUST include a one-sentence `intent` describing what to " +
  "cover. The user reads this to decide whether to keep / reorder / drop.\n" +
  "4. Do not include 'Introduction' or 'Conclusion' boilerplate unless the " +
  "topic genuinely benefits from one.\n" +
  "Output JSON only.";

function buildUserPrompt(state: WikiComposeStateType): string {
  const title = state.pageSnapshot?.title ?? "(untitled)";
  const briefSummary = state.brief?.summary ?? "(no brief provided)";
  const sources = state.approvedResearch.slice(0, 20).map((s, i) => {
    const kind = s.kind.toUpperCase();
    return `[${i + 1}] (${kind}) ${s.title}`;
  });
  const sourceBlock = sources.length > 0 ? sources.join("\n") : "(no approved research sources)";
  return [
    `[Page title]`,
    title,
    "",
    "[Brief summary]",
    briefSummary,
    "",
    `[Approved research sources: ${state.approvedResearch.length}]`,
    sourceBlock,
  ].join("\n");
}

/** `structure_dialogue` node — proposes the outline. */
export async function structureDialogue(
  state: WikiComposeStateType,
  config: LangGraphRunnableConfig,
): Promise<WikiComposeStateUpdate> {
  const ctx = getGraphContext(config);

  await dispatchComposePhase({ phase: "structure", status: "entered" }, config);

  const modelId = await resolveComposeModelId("orchestrator", ctx.backend, ctx.tier, ctx.db);
  const model = await createZediChatModel({
    modelId,
    userId: ctx.userId,
    tier: ctx.tier,
    db: ctx.db,
    feature: `${ctx.feature}:structure`,
    backend: ctx.backend,
    temperature: 0.4,
    maxTokens: 2048,
  });
  const structured = model.withStructuredOutput(outlineProposalSchema, {
    name: "structure_dialogue",
  });

  // `structured.invoke` returns the zod input type (pre-default); we apply
  // fallbacks (`depth ?? 1`) at the projection step below.
  let raw: z.input<typeof outlineProposalSchema>;
  try {
    raw = await structured.invoke([
      {
        role: "system",
        content: SYSTEM_PROMPT + composeContentLocaleInstruction(ctx.contentLocale),
      },
      { role: "user", content: buildUserPrompt(state) },
    ]);
  } catch {
    // Defensive fallback: emit a minimal 3-section outline so the user can
    // edit-rather-than-blank-out when the LLM fails (rare). Heading text
    // intentionally generic so the user is prompted to rename.
    // LLM 失敗時は 3 セクションの仮アウトラインを返してフローを止めない。
    raw = { sections: structureDialogueFallbackOutline(ctx.contentLocale) };
  }

  const outline: OutlineSection[] = raw.sections.map((s) => ({
    id: randomUUID(),
    heading: s.heading,
    depth: s.depth ?? 1,
    intent: s.intent,
  }));

  return {
    outlineProposal: outline,
    phase: "structure:await_user",
  };
}
