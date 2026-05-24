/**
 * Resume payload validators for the Wiki Compose orchestrator graph (#950).
 *
 * 各 interrupt 点で `PATCH /api/pages/:pageId/compose-sessions/:id/resume` が
 * 受け取る `body.resume` の shape を zod で検証する。Brief / Outline それぞれ
 * 専用のスキーマを持つ（Research は subgraph 側の `researchResumeSchema` を流用）。
 *
 * Validates the resume payload submitted via the resume endpoint at each
 * orchestrator interrupt point. The route layer hands `body.resume` to the
 * graph and these schemas catch malformed payloads before they pollute state.
 */
import { z } from "zod";

/**
 * Resume payload for `human_review_brief`.
 *
 * - `answers` — 必須。空配列でも可（Brief をスキップしたケース）。
 * - `appendToExisting` — 本文ありページで「追記」を選んだ場合 true。
 * - `researchMaxIterations` — Brief 内で 1..5 にユーザーが調整した場合のみ。
 *
 * Validates the resume payload at the Brief interrupt. `answers` is required
 * even when empty (the user may explicitly skip Brief by submitting an empty
 * array). Default for `appendToExisting` is `false` (replace-mode is the
 * historical Wiki Compose behaviour); `researchMaxIterations` is clamped to
 * 1..5 by the schema so the graph never sees an out-of-range value.
 */
export const briefResumeSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedOptionIds: z.array(z.string().min(1)).default([]),
        freeText: z.string().optional(),
      }),
    )
    .default([]),
  appendToExisting: z.boolean().optional().default(false),
  researchMaxIterations: z.number().int().min(1).max(5).optional(),
});

export type BriefResumeParsed = z.infer<typeof briefResumeSchema>;

/**
 * Resume payload for `human_review_outline`.
 *
 * - `sections` — 確定アウトライン。空配列は許容しない（最低 1 セクションは必要）。
 *
 * Validates the resume payload at the outline interrupt. The user must
 * approve at least one section — an empty outline is rejected so Draft does
 * not try to render an article with no sections.
 */
export const outlineResumeSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().min(1),
        heading: z.string().min(1),
        depth: z.number().int().min(1).max(3),
        intent: z.string().default(""),
        sourceIds: z.array(z.string().min(1)).optional(),
      }),
    )
    .min(1),
});

export type OutlineResumeParsed = z.infer<typeof outlineResumeSchema>;
