// Unit tests do not load these files. Remove an entry when unit tests cover it.
// If a new file's mutants are all NoCoverage, add unit tests or list it here.
// 単体テストが読み込まないファイル。単体テストを足したら一覧から外す。
// 新しいファイルのミュータントがすべて NoCoverage なら、単体テストを書くか一覧に足す。
export const INTEGRATION_ONLY = [
  "src/client/App.tsx",
  "src/client/editor/SuggestionList.tsx",
  "src/client/editor/WikiLinkChip.tsx",
  "src/client/main.tsx",
  "src/client/pages/AiChatPage.tsx",
  "src/client/session.ts",
  "src/client/sw/sw.ts",
  "src/testIdp/index.ts",
  "src/worker/app.tsx",
  "src/worker/auth.ts",
  "src/worker/db/d1Schema.ts",
  "src/worker/db/schema.ts",
  "src/worker/index.ts",
  "src/worker/landing.tsx",
  "src/worker/pageRoom.ts",
  "src/worker/realtime/authorize.ts",
  "src/worker/secondFactor/context.ts",
  "src/worker/secondFactor/manageRoutes.ts",
  "src/worker/secondFactor/passkeyRoutes.ts",
  "src/worker/secondFactor/routes.ts",
  "src/worker/secondFactor/session.ts",
  "src/worker/secondFactor/store.ts",
  "src/worker/services/access.ts",
  "src/worker/services/cost.ts",
  "src/worker/services/notes.ts",
  "src/worker/services/pages.ts",
];

/**
 * Check whether an app-relative path is a mutation target.
 * app/ からの相対パスが Mutation の対象かを判定する。
 * @param {string} appPath
 * @returns {boolean}
 */
export function isMutationTarget(appPath) {
  return (
    appPath.startsWith("src/") &&
    /\.tsx?$/.test(appPath) &&
    !/\.(?:test\.tsx?|d\.ts)$/.test(appPath) &&
    !appPath.startsWith("src/worker/integration/") &&
    !INTEGRATION_ONLY.includes(appPath)
  );
}

/**
 * Deduplicate repository paths under app/ and return sorted app-relative paths.
 * app/ 配下のパスを相対パスに変換し、重複を除いて昇順にする。
 * @param {string[]} repoPaths
 * @returns {string[]}
 */
function selectAppPaths(repoPaths) {
  const appPaths = repoPaths
    .filter((path) => path.startsWith("app/"))
    .map((path) => path.slice("app/".length));
  return [...new Set(appPaths)].sort();
}

/**
 * Select changed mutation targets from repository-relative paths.
 * リポジトリの相対パスから変更された Mutation 対象を抽出する。
 * @param {string[]} repoPaths
 * @returns {string[]}
 */
export function selectChangedTargets(repoPaths) {
  return selectAppPaths(repoPaths).filter(isMutationTarget);
}

/**
 * Select changed files excluded by the integration-only list.
 * 変更されたファイルのうち、対象外一覧にあるパスを抽出する。
 * @param {string[]} repoPaths
 * @returns {string[]}
 */
export function selectSkippedIntegrationOnly(repoPaths) {
  return selectAppPaths(repoPaths).filter((path) => INTEGRATION_ONLY.includes(path));
}
