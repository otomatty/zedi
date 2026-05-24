/**
 * `brief_dialogue` — Wiki Compose orchestrator entry node (#950).
 *
 * Brief フェーズの最初のノード。ページタイトル + 既存本文プレビューから、
 * 0〜7 件の構造化質問を Orchestrator LLM に生成させる。`compose_phase` SSE を
 * `entered` で発火し、生成後は `briefQuestions` を state に書き、`phase` を
 * `brief:await_user` にして次の `human_review_brief` interrupt に進む。
 *
 * Brief never opens a free-form chat — it always emits the question cards
 * that the frontend renders (the user fills them in and resumes). The node
 * also loads the page snapshot exactly once at session start so downstream
 * phases can read it without re-querying.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createZediChatModel } from "../../../core/llm/modelFactory.js";
import { getGraphContext } from "../../../subgraphs/research/nodes/shared/getGraphContext.js";
import { loadPageSnapshot } from "./shared/loadPageSnapshot.js";
import { dispatchComposePhase } from "./shared/dispatch.js";
import type { WikiComposeStateType, WikiComposeStateUpdate } from "../state.js";
import type { BriefQuestion } from "../types.js";

const ORCHESTRATOR_MODEL_ENV = "WIKI_COMPOSE_ORCHESTRATOR_MODEL_ID";
const ORCHESTRATOR_MODEL_FALLBACK = "claude-3-5-haiku";

function getOrchestratorModelId(): string {
  return process.env[ORCHESTRATOR_MODEL_ENV]?.trim() || ORCHESTRATOR_MODEL_FALLBACK;
}

/**
 * Schema for the LLM's structured output. The Orchestrator is told it MAY
 * return zero questions when the title is unambiguous (e.g. a single specific
 * proper noun with existing content). Hard cap at 7 to keep the UI scannable.
 */
export const briefQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(1).max(200),
        rationale: z.string().max(200).optional(),
        options: z
          .array(
            z.object({
              label: z.string().min(1).max(80),
              hint: z.string().max(160).optional(),
            }),
          )
          .max(6)
          .default([]),
        required: z.boolean().default(false),
      }),
    )
    .min(0)
    .max(7),
});

const SYSTEM_PROMPT =
  "You are the orchestrator for Wiki Compose, an AI agent that helps a user " +
  "co-author a wiki article. Given a page title (and optional existing body), " +
  "decide what Brief questions (if any) you need to ask before research. " +
  "Constraints:\n" +
  "1. Output 0..7 questions. Prefer FEWER questions; only ask what is needed " +
  "to disambiguate scope, audience, or depth.\n" +
  "2. Each question MUST be answerable via option chips when reasonable " +
  "(2..6 options). Free-text is always allowed on top, so don't add a " +
  "trailing 'other' option.\n" +
  "3. If the existing body is non-empty, you may include a question that " +
  "asks whether to append or replace.\n" +
  "4. Mark a question 'required: true' ONLY when leaving it unanswered would " +
  "make the article unwritable. Most questions should be optional.\n" +
  "Respond as JSON only.";

function buildUserPrompt(
  title: string,
  body: string,
  chatSeed?: { outline: string; conversationText: string; userSchema?: string } | null,
): string {
  const parts: string[] = [`[Page title]`, title || "(no title yet)"];
  if (body.trim()) {
    parts.push(
      "",
      "[Existing body excerpt — first ~600 chars]",
      body.slice(0, 600),
      body.length > 600 ? `\n(…truncated; total ${body.length} chars)` : "",
    );
  } else {
    parts.push("", "(Page body is empty.)");
  }
  if (chatSeed?.outline?.trim()) {
    parts.push("", "[User-approved outline from chat]", chatSeed.outline.trim().slice(0, 2000));
  }
  if (chatSeed?.conversationText?.trim()) {
    parts.push(
      "",
      "[Chat transcript excerpt]",
      chatSeed.conversationText.trim().slice(0, 4000),
      chatSeed.conversationText.length > 4000
        ? `\n(…truncated; total ${chatSeed.conversationText.length} chars)`
        : "",
    );
  }
  if (chatSeed?.userSchema?.trim()) {
    parts.push("", "[User wiki schema]", chatSeed.userSchema.trim().slice(0, 1500));
  }
  return parts.join("\n");
}

/**
 * `brief_dialogue` node — generates the Brief question cards and stamps the
 * `pageSnapshot` into state.
 */
export async function briefDialogue(
  state: WikiComposeStateType,
  config: LangGraphRunnableConfig,
): Promise<WikiComposeStateUpdate> {
  const ctx = getGraphContext(config);

  await dispatchComposePhase({ phase: "brief", status: "entered" }, config);

  // Load the snapshot once. Subsequent phases read from state, never the DB.
  // セッション開始時に 1 度だけ読み、以後は state を参照する。
  const snapshot = state.pageSnapshot ?? (await loadPageSnapshot(ctx.db, ctx.pageId));

  const model = await createZediChatModel({
    modelId: getOrchestratorModelId(),
    userId: ctx.userId,
    tier: ctx.tier,
    db: ctx.db,
    feature: `${ctx.feature}:brief`,
    backend: ctx.backend,
    temperature: 0.3,
    maxTokens: 1024,
  });
  const structured = model.withStructuredOutput(briefQuestionsSchema, { name: "brief_dialogue" });

  // `structured.invoke` returns the zod input type (pre-default), so we
  // accept it as-is and apply fallbacks at the projection step below.
  let raw: z.input<typeof briefQuestionsSchema>;
  try {
    raw = await structured.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: buildUserPrompt(snapshot.title, snapshot.body, state.chatSeed),
      },
    ]);
  } catch {
    // Defensive fallback: if the LLM call fails, emit an empty Brief so the
    // user can still proceed straight to research. The orchestrator must not
    // become unstartable just because of a transient model error.
    // LLM 失敗時は Brief 0 件で先へ進ませる安全策。
    raw = { questions: [] };
  }

  const briefQuestions: BriefQuestion[] = raw.questions.map((q) => ({
    id: randomUUID(),
    question: q.question,
    rationale: q.rationale,
    options: (q.options ?? []).map((o) => ({
      id: randomUUID(),
      label: o.label,
      hint: o.hint,
    })),
    required: Boolean(q.required),
  }));

  return {
    pageSnapshot: snapshot,
    briefQuestions,
    phase: "brief:await_user",
  };
}
