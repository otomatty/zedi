/**
 * `human_review_brief` — Wiki Compose Brief interrupt node (#950).
 *
 * Brief 質問群を `interrupt(value)` でユーザーに渡し、`PATCH .../resume` の
 * 結果を `briefResumeSchema` で検証して `brief` を state に確定する。
 * 既存本文ありで「追記」を選んだ場合は `appendToExisting=true` が立ち、Draft
 * フェーズがそれを読んで挙動を切り替える。
 *
 * Halts the graph at the Brief interrupt and projects the user's answers into
 * `state.brief`.
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
 * Build the auto-derived Brief for instant mode. Folds the page title and any
 * chat seed (user-approved outline + conversation + schema from Promote to
 * Wiki) into the natural-language summary that downstream nodes read, so the
 * instant draft honours the promoted content instead of a generic title-only
 * article.
 *
 * 即時モードの自動 Brief を生成する。タイトルと chatSeed（承認済みアウトライン・
 * 会話・スキーマ）を要約に畳み込み、後段ノードが促進元の内容を反映できるようにする。
 */
function buildInstantBrief(state: WikiComposeStateType): BriefResult {
  const title = state.pageSnapshot?.title?.trim();
  const seed = state.chatSeed;
  const lines: string[] = [];
  if (title) {
    lines.push(`Write a clear, well-structured wiki article about "${title}".`);
  }
  if (seed?.outline?.trim()) {
    lines.push("", "User-approved outline to follow:", seed.outline.trim().slice(0, 2000));
  }
  if (seed?.conversationText?.trim()) {
    const convo = seed.conversationText.trim();
    lines.push("", "Source conversation excerpt:", convo.slice(0, 2000));
  }
  if (seed?.userSchema?.trim()) {
    lines.push("", "User wiki schema to honour:", seed.userSchema.trim().slice(0, 1500));
  }
  return {
    answers: [],
    summary: lines.length > 0 ? lines.join("\n") : "(no brief)",
    appendToExisting: false,
  };
}

/**
 * `human_review_brief` node — interrupt + resume projection.
 */
export async function humanReviewBrief(
  state: WikiComposeStateType,
  _config: LangGraphRunnableConfig,
): Promise<WikiComposeStateUpdate> {
  // Instant mode: never block on the Brief. Auto-derive a brief so the flow
  // continues straight to structure → draft. Crucially, fold in the chat seed
  // (Promote to Wiki / AI chat) so the user-approved outline and conversation
  // still drive the article instead of a generic title-only draft — downstream
  // `structureDialogue` / `draftSections` only read `brief.summary`, not
  // `state.chatSeed`, so the seed must be surfaced here (Codex P2 on PR #1048).
  // 即時モードでは Brief で止まらないが、Promote to Wiki 由来の chatSeed
  // （承認済みアウトライン・会話）を要約に畳み込み、汎用記事化を防ぐ。
  if (state.mode === "instant") {
    return { brief: buildInstantBrief(state), phase: "brief:completed" };
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
  return update;
}
