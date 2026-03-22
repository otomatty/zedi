/**
 * Stryker config for `scripts/stryker-mutate-changed.mjs` only.
 * Same as `stryker.config.mjs` but does not fail the process on global mutation score.
 *
 * `stryker.config.mjs` のコピーに近いが、`--mutate` で一部ファイルだけを対象にしたときの
 * スコアがリポジトリ全体の閾値と整合しないため、`thresholds.break` を無効化する。
 */
import base from "./stryker.config.mjs";

export default {
  ...base,
  thresholds: {
    ...base.thresholds,
    break: null,
  },
};
