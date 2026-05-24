/**
 * `completed` — Wiki Compose terminal node (#950).
 *
 * Draft フェーズ後の最終ノード。`draftedSections` を `approvedOutline` の順に
 * 並べ替えて Markdown を組み立て、`completion` に書き込む。citation source は
 * `approvedResearch` から実際に引用された分だけ抽出する。`compose_phase` SSE
 * を `completed` で発火し、ストリームを終了する。
 *
 * Pure projection node. Sequences `draftedSections` by `approvedOutline`
 * order, concatenates them with `## heading` lines, and collates the cited
 * sources for the final compose output. No LLM call.
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { dispatchComposePhase } from "./shared/dispatch.js";
import type { WikiComposeStateType, WikiComposeStateUpdate } from "../state.js";
import type { ComposeCompletion, DraftedSection, Source } from "../types.js";

/** `completed` node — final projection. */
export async function completed(
  state: WikiComposeStateType,
  config: LangGraphRunnableConfig,
): Promise<WikiComposeStateUpdate> {
  const outline = state.approvedOutline?.sections ?? [];
  const draftById = new Map<string, DraftedSection>();
  for (const d of state.draftedSections) draftById.set(d.sectionId, d);

  // Walk the outline so the final order matches the user's approved layout
  // even if `draftedSections` was filled in a different order (mid-flight
  // re-draft, etc.).
  // ユーザー承認済みアウトラインの順に並べる。
  const ordered: DraftedSection[] = [];
  for (const section of outline) {
    const drafted = draftById.get(section.id);
    if (drafted) ordered.push(drafted);
  }

  const lines: string[] = [];
  for (const section of outline) {
    const drafted = draftById.get(section.id);
    if (!drafted) continue;
    const prefix = "#".repeat(Math.min(3, Math.max(2, section.depth + 1)));
    lines.push(`${prefix} ${section.heading}`);
    lines.push("");
    lines.push(drafted.body);
    lines.push("");
  }
  const markdown = lines.join("\n").trim() + "\n";

  const citedIds = new Set<string>();
  for (const d of ordered) for (const id of d.citedSourceIds) citedIds.add(id);
  const citedSources: Source[] = state.approvedResearch.filter((s) => citedIds.has(s.id));

  const completion: ComposeCompletion = {
    markdown,
    sections: ordered,
    citedSources,
    completedAt: new Date().toISOString(),
  };

  await dispatchComposePhase({ phase: "completed", status: "entered" }, config);

  return {
    completion,
    phase: "completed",
  };
}
