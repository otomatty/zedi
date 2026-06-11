/**
 * `human_review_brief` — Wiki Compose Brief interrupt node (#950).
 *
 * Brief 質問群を `interrupt(value)` でユーザーに渡し、`PATCH .../resume` の
 * 結果を `briefResumeSchema` で検証して `brief` を state に確定する。
 * 既存本文ありで「追記」を選んだ場合は `appendToExisting=true` が立ち、Draft
 * フェーズがそれを読んで挙動を切り替える。`researchMaxIterations` (1..5) が
 * 指定されていれば、後段の Research subgraph に渡るようミラーする。
 *
 * Halts the graph at the Brief interrupt and projects the user's answers into
 * `state.brief`. The resume payload's `researchMaxIterations` (when present)
 * is mirrored to `state.researchMaxIterations` so the research subgraph node
 * picks it up via its own state slot when invoked.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { interrupt } from "@langchain/langgraph";
import { briefResumeSchema } from "../resumeSchemas.js";
import type { WikiComposeStateType, WikiComposeStateUpdate } from "../state.js";
import type {
  BriefAnswer,
  BriefResult,
  PageSnapshot,
  WikiComposeInterruptPayload,
} from "../types.js";

const EMPTY_SNAPSHOT: PageSnapshot = { pageId: "", title: "", body: "", hasContent: false };

/**
 * Build the natural-language Brief summary that downstream nodes embed in
 * their prompts. Keeps the structure stable so prompt-snapshot tests don't
 * churn on LLM upgrades.
 *
 * Brief 確定回答を Markdown で要約する。後段プロンプトに渡す書式を 1 箇所に集約する。
 */
function summariseBrief(answers: BriefAnswer[], questions: Map<string, string>): string {
  if (answers.length === 0) return "(no brief provided)";
  const lines: string[] = [];
  for (const a of answers) {
    const q = questions.get(a.questionId) ?? "(unknown question)";
    const parts: string[] = [];
    if (a.selectedOptionIds.length > 0) parts.push(`selected=${a.selectedOptionIds.join(", ")}`);
    if (a.freeText && a.freeText.trim()) parts.push(`note=${a.freeText.trim()}`);
    lines.push(`- ${q} → ${parts.join(" | ") || "(no answer)"}`);
  }
  return lines.join("\n");
}

/**
 * `human_review_brief` node — interrupt + resume projection.
 */
export async function humanReviewBrief(
  state: WikiComposeStateType,
  _config: LangGraphRunnableConfig,
): Promise<WikiComposeStateUpdate> {
  // Instant mode: never block on the Brief. Auto-derive an empty brief so the
  // flow continues straight to structure → draft. The natural-language summary
  // falls back to the page title so downstream prompts still have context.
  // 即時モードでは Brief で止まらず、タイトルを要約に使った空 Brief で続行する。
  if (state.mode === "instant") {
    const title = state.pageSnapshot?.title?.trim();
    const brief: BriefResult = {
      answers: [],
      summary: title
        ? `Write a clear, well-structured wiki article about "${title}".`
        : "(no brief)",
      appendToExisting: false,
    };
    return { brief, phase: "brief:completed" };
  }

  const payload: WikiComposeInterruptPayload = {
    kind: "human_review_brief",
    questions: state.briefQuestions,
    pageSnapshot: state.pageSnapshot ?? EMPTY_SNAPSHOT,
  };
  const resumeValue: unknown = interrupt(payload);
  const parsed = briefResumeSchema.parse(resumeValue);

  // Index questions by id so we can produce a stable, readable summary.
  // 質問テキストを id → text で引けるよう、ループの外で 1 度だけ Map 化する。
  const questionMap = new Map<string, string>();
  for (const q of state.briefQuestions) questionMap.set(q.id, q.question);

  const answers: BriefAnswer[] = parsed.answers.map((a) => ({
    questionId: a.questionId,
    selectedOptionIds: a.selectedOptionIds,
    ...(a.freeText !== undefined ? { freeText: a.freeText } : {}),
  }));

  const brief: BriefResult = {
    answers,
    summary: summariseBrief(answers, questionMap),
    appendToExisting: Boolean(parsed.appendToExisting),
  };

  const update: WikiComposeStateUpdate = {
    brief,
    phase: "brief:completed",
  };
  if (parsed.researchMaxIterations !== undefined) {
    // Mirror onto the canonical research subgraph channel name so the
    // composed research node picks it up via shared state.
    // research subgraph と共有する `maxIterations` チャネルに反映する。
    update.maxIterations = parsed.researchMaxIterations;
  }
  return update;
}
