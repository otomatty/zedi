/**
 * Stryker config for nightly full mutation runs (`.github/workflows/nightly-mutation.yml`) only.
 * Same as `stryker.config.mjs` but does not fail the process on global mutation score.
 *
 * Nightly はスコア推移の観測・レポート取得が目的（Issue #1050）。現状の全量スコアは
 * `thresholds.break: 70` を下回るため、break で fail させると完走済みレポートまで
 * 「失敗」に埋もれてしまう。nightly では `break` を無効化して success で完走させ、
 * スコアは artifact `mutation-report-nightly` と Job Summary で追跡する。
 *
 * PR の `mutation-light`（`ci.yml`）は引き続き `stryker.config.mjs` の `break: 70` を使用。
 * 全量スコアが安定して 70 を超えたら、本ファイルの `break` を戻すことを検討する（#1050 Phase 4）。
 */
import base from "./stryker.config.mjs";

export default {
  ...base,
  thresholds: {
    ...base.thresholds,
    break: null,
  },
};
