/**
 * Resume payload validator for `human_review_research`.
 *
 * `PATCH /api/pages/:pageId/compose-sessions/:id/resume` 経由で送られてくる
 * `body.resume` のうち、`graphId === "wiki-compose-research"` 向けの shape を
 * zod で検証する。失敗時は throw され、`graphRunner` が `{ status: "failed" }`
 * を返して route 層が 4xx を返す。
 *
 * Validates the resume payload that the route layer hands to the interrupted
 * graph. Throws on invalid input so the runner short-circuits to "failed",
 * preventing partial projections of an ill-formed payload into state.
 */
import { z } from "zod";

/**
 * Resume payload zod schema.
 *
 * - `approvedSourceIds` — 必須。空配列も許容（=全 reject）。
 * - `rejectedSourceIds` — 任意。重複は除去して扱う。
 * - `note` — 任意の自由記述。HITL 側のメモ用。
 *
 * Schema for the human-in-the-loop approval payload. `approvedSourceIds` is
 * required (empty array means "reject all"); `rejectedSourceIds` defaults to
 * the empty array; `note` is free-form metadata.
 */
export const researchResumeSchema = z.object({
  approvedSourceIds: z.array(z.string().min(1)).default([]),
  rejectedSourceIds: z.array(z.string().min(1)).optional().default([]),
  note: z.string().optional(),
});

/** Inferred TS type for the parsed resume payload. */
export type ResearchResumeParsed = z.infer<typeof researchResumeSchema>;
