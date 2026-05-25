/**
 * Ingest planner graph types (issue #952).
 *
 * `ingestPlanner.ts` サービス型の graph 用エイリアス。サービス層を正とし、
 * graph state は同じ shape を参照する。
 */
export type {
  IngestAction,
  IngestPlan,
  IngestConflict,
  CandidatePage,
  IngestArticleSummary,
} from "../../../services/ingestPlanner.js";
