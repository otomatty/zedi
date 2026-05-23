import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { MarkType, ResolvedPos } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { wikiLinkSuggestionPluginKey } from "./wikiLinkSuggestionPlugin";
import { tagSuggestionPluginKey } from "./tagSuggestionPlugin";
import { slashSuggestionPluginKey } from "./slashSuggestionPlugin";

/**
 * Lightweight candidate page descriptor consumed by the ghost completion plugin.
 * ゴースト補完プラグインが必要とする候補ページの最小情報。
 *
 * Mirrors the subset of `useWikiLinkCandidates` result shape that the plugin
 * actually needs: id (for resolving the target page on confirm), title (for
 * matching + ghost rendering), and an optional `isDeleted` flag so soft-deleted
 * pages can be skipped at match time.
 *
 * `useWikiLinkCandidates` の戻り値のうち本プラグインが必要とする部分集合。
 * `id`（確定時のターゲット解決）、`title`（マッチ + ゴースト表示）、削除済み
 * ページを除外するための `isDeleted` を含む。
 */
export interface WikiLinkGhostCompletionCandidate {
  id: string;
  title: string;
  isDeleted?: boolean;
}

/**
 * Plugin state for the inline ghost completion.
 * インラインゴースト補完のプラグイン状態。
 *
 * - `active`: ゴーストを表示中か / whether the ghost suffix is rendered.
 * - `range`: 入力中の単語のドキュメント内範囲。確定時に置換に使う /
 *            range covering the typed word; used as the replacement range on confirm.
 * - `query`: 入力された接頭辞そのもの（タイプ時の大小区別を保持） /
 *            the raw prefix the user typed (preserves case).
 * - `candidate`: 一致した候補ページ（id + 完全な title） /
 *                matched candidate (id + full title).
 * - `suffix`: ゴーストとして表示する残り部分。`candidate.title.slice(query.length)` /
 *             remainder shown as ghost = `candidate.title.slice(query.length)`.
 * - `decorations`: ゴースト widget を含む装飾セット /
 *                  decoration set holding the ghost widget.
 */
export interface WikiLinkGhostCompletionState {
  active: boolean;
  range: { from: number; to: number } | null;
  query: string;
  candidate: WikiLinkGhostCompletionCandidate | null;
  suffix: string;
  decorations: DecorationSet;
}

/**
 * ProseMirror plugin key for {@link WikiLinkGhostCompletionPlugin}.
 * {@link WikiLinkGhostCompletionPlugin} 用の ProseMirror プラグインキー。
 */
export const wikiLinkGhostCompletionPluginKey = new PluginKey<WikiLinkGhostCompletionState>(
  "wikiLinkGhostCompletion",
);

/**
 * Options for {@link WikiLinkGhostCompletionPlugin}.
 * {@link WikiLinkGhostCompletionPlugin} のオプション。
 */
export interface WikiLinkGhostCompletionOptions {
  /**
   * Returns the latest candidate list. Called on every transaction (cheap;
   * a linear prefix scan over the array is performed). The host should keep
   * a ref to `useWikiLinkCandidates` output and return `ref.current` here so
   * the editor instance does not have to be re-created when candidates change.
   *
   * 最新の候補一覧を返す。トランザクションごとに呼ばれる（線形 prefix scan を
   * 行う）。ホストは `useWikiLinkCandidates` の戻り値を ref に保持し
   * `ref.current` を返すことで、候補更新時にエディタを作り直さずに済む。
   */
  getCandidates: () => ReadonlyArray<WikiLinkGhostCompletionCandidate>;

  /**
   * Notifies the host on every state transition. Optional; the plugin handles
   * confirmation internally so most hosts do not need to observe state.
   *
   * 状態遷移ごとに呼ばれる任意のコールバック。確定処理はプラグイン内で完結
   * するため、ほとんどの呼び出し側は購読不要。
   */
  onStateChange?: (state: WikiLinkGhostCompletionState) => void;

  /**
   * Allow-list of parent node `type.name` values where the ghost may fire.
   * Defaults to body-text containers (paragraph, heading, list items,
   * blockquote, table cells). Configurable for tests.
   *
   * ゴーストを発火させて良い親ノード名のセット。本文系（段落・見出し・
   * リスト・引用・テーブル）が既定。テストでの差し替えを可能にする。
   */
  allowedNodeTypes?: ReadonlySet<string>;
}

/**
 * Default allow-listed parent node types for ghost activation.
 * ゴースト発火を許容する親ノード名（既定）。
 *
 * Issue #930 acceptance criteria call for: paragraph / heading / list items /
 * blockquote / table cells. We include both `code_block` style node names and
 * Tiptap's PascalCase variants nowhere — the deny path uses
 * `parent.type.spec.code` (covers any code-marked node) so only the explicit
 * body types need to live here. Task items inherit `listItem` for body content
 * but Tiptap names the node `taskItem`, so list both.
 *
 * 受け入れ条件に合わせて、本文系ノードのみを許容する。コード系は
 * `parent.type.spec.code` の判定で別途排除するため、本セットには含めない。
 */
const DEFAULT_ALLOWED_NODE_TYPES: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "listItem",
  "list_item",
  "taskItem",
  "task_item",
  "blockquote",
  "tableCell",
  "table_cell",
  "tableHeader",
  "table_header",
]);

/**
 * Ancestor node names that disqualify the ghost completion even when the
 * direct parent passes the allow-list. Mirrors the issue spec: "title /
 * caption / 本文外". `code_block` is defensive — `parent.type.spec.code` is
 * the primary guard.
 *
 * 直接の親が許容リストを満たしていても、祖先がこれらのいずれかなら不発火。
 * Issue #930 の「タイトル / キャプション等の本文外」に対応。`code_block` は
 * 念のための保険（メインの判定は `parent.type.spec.code`）。
 */
const EXCLUDED_ANCESTOR_NODE_TYPES: ReadonlySet<string> = new Set([
  "title",
  "caption",
  "codeBlock",
  "code_block",
]);

/**
 * CSS class applied to the ghost widget DOM. Styled in `src/index.css`.
 * ゴースト widget DOM に付与する CSS クラス。スタイルは `src/index.css`。
 */
const GHOST_CLASS = "wiki-link-ghost-completion";

/**
 * `data-*` attribute used by mouse/touch event delegation to detect a tap on
 * the ghost suffix. Centralised so tests and CSS hooks stay in sync.
 *
 * ゴースト suffix のタップ判定で `closest()` する際の `data-*` 属性。
 */
const GHOST_DATA_ATTR = "data-ghost-completion";

/**
 * Empty (inactive) state factory. Used in every dismissal branch so the shape
 * is consistent and ProseMirror does not retain a stale decoration set.
 *
 * 非アクティブ状態の生成ヘルパー。あらゆる dismiss 経路で同じ形を返すため。
 */
function createInactiveState(): WikiLinkGhostCompletionState {
  return {
    active: false,
    range: null,
    query: "",
    candidate: null,
    suffix: "",
    decorations: DecorationSet.empty,
  };
}

/**
 * Collapse to inactive state without spamming `onStateChange` when the state
 * was already inactive. Used by every dismissal branch in `apply` to keep the
 * cyclomatic complexity manageable.
 *
 * 非アクティブに倒すヘルパー。前回も非アクティブなら no-op で `onStateChange`
 * を再通知しない。`apply` の dismissal 分岐を一本化して複雑度を抑える。
 */
function deactivate(
  prev: WikiLinkGhostCompletionState,
  onStateChange: ((s: WikiLinkGhostCompletionState) => void) | undefined,
): WikiLinkGhostCompletionState {
  if (!prev.active) return prev;
  const next = createInactiveState();
  onStateChange?.(next);
  return next;
}

/**
 * Reasons that disqualify the cursor context from showing a ghost completion.
 * Returns the first match, or `null` if the context is OK. Bundles the
 * boundary-only checks that depend on the schema / selection but not on the
 * candidate list, so `apply` can fast-bail.
 *
 * カーソル状況がゴーストを出すべきでない理由を返す（OK なら `null`）。
 * 候補一覧に依存しない境界系の判定だけをまとめて、`apply` の早期 return に使う。
 */
function findContextSuppression(
  newState: EditorState,
  allowedNodeTypes: ReadonlySet<string>,
): string | null {
  const { selection, schema } = newState;
  if (!selection.empty) return "range-selection";

  if (wikiLinkSuggestionPluginKey.getState(newState)?.active) return "wiki-suggestion-active";
  if (tagSuggestionPluginKey.getState(newState)?.active) return "tag-suggestion-active";
  // Slash サジェストが開いている間は同時に発火させない。`SlashSuggestionPlugin`
  // は空白を含むクエリでも active を保つため (`/(^|\\s)\\/([^\\n]*)$/`)、
  // 「`/cmd Ghost`」のような入力でゴーストと UI が二重に出るのを抑止する。
  // また Tab を奪われずスラッシュメニュー側のキー操作を維持する。
  // Mutually exclude with the slash menu: `SlashSuggestionPlugin` stays
  // active across spaces, so `/cmd Ghost` would otherwise double-fire the
  // ghost widget and steal Tab from the slash command flow.
  if (slashSuggestionPluginKey.getState(newState)?.active) return "slash-suggestion-active";

  const { $from } = selection;
  if ($from.parent.type.spec.code) return "code-block";
  if (isInsideInlineCode($from, schema.marks)) return "inline-code";
  if (isInsideExcludedAncestor($from)) return "excluded-ancestor";
  if (!allowedNodeTypes.has($from.parent.type.name)) return "disallowed-parent";

  const wikiLinkMark = schema.marks.wikiLink;
  if (wikiLinkMark && wikiLinkMark.isInSet($from.marks())) return "inside-wiki-link";

  return null;
}

/**
 * Extract the current typed word from the paragraph-local text before the
 * caret. Returns `null` when the word is missing, too short, contains a
 * non-text node placeholder, or starts with a character reserved for another
 * suggestion flow.
 *
 * カーソル直前の段落ローカルテキストから「現在タイプ中の単語」を抽出する。
 * 単語がない / 2 文字未満 / 非テキストノード混在 / 他フローの先導文字始まり
 * の場合は `null` を返す。
 */
function extractTypedWord($from: ResolvedPos): string | null {
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "￼");
  const match = textBefore.match(/(\S+)$/);
  if (!match) return null;
  const word = match[1];
  if (word.includes("￼")) return null;
  if (word.length < 2) return null;
  const first = word[0];
  if (first === "[" || first === "]" || first === "#" || first === "@" || first === "/") {
    return null;
  }
  return word;
}

/**
 * Find the best prefix-matching candidate for a typed word. Filters out
 * soft-deleted pages and exact matches (no remainder to show), and breaks
 * ties by shortest title — the most likely intended completion.
 *
 * 入力済み接頭辞に対する最良の候補を返す。削除済み・完全一致を除外し、
 * 同 prefix の複数候補は最短タイトル優先で選ぶ。
 */
function findBestCandidate(
  typedWord: string,
  pages: ReadonlyArray<WikiLinkGhostCompletionCandidate>,
): WikiLinkGhostCompletionCandidate | null {
  const lowered = typedWord.toLowerCase();
  let best: WikiLinkGhostCompletionCandidate | null = null;
  for (const p of pages) {
    if (p.isDeleted) continue;
    if (p.title.length <= typedWord.length) continue;
    if (!p.title.toLowerCase().startsWith(lowered)) continue;
    if (!best || p.title.length < best.title.length) {
      best = p;
    }
  }
  return best;
}

/**
 * Walk the resolved position to detect whether the caret sits inside an inline
 * `code` mark. Mirrors the helper used in `tagSuggestionPlugin`.
 *
 * カーソル位置がインライン `code` マーク内にあるかを判定する。
 * `tagSuggestionPlugin` の同名ヘルパーと同じロジック。
 */
function isInsideInlineCode($from: ResolvedPos, schemaMarks: Record<string, MarkType>): boolean {
  const codeMark = schemaMarks.code;
  if (!codeMark) return false;
  return Boolean(codeMark.isInSet($from.marks()));
}

/**
 * Walk ancestors to detect title/caption/code_block containers that disqualify
 * the ghost even when the inner block looks permissible.
 *
 * 祖先ノードを辿って、ゴーストを出してはいけないコンテナ内（タイトル・
 * キャプション・コードブロック）かを判定する。
 */
function isInsideExcludedAncestor($from: ResolvedPos): boolean {
  for (let depth = $from.depth; depth >= 0; depth--) {
    const name = $from.node(depth).type.name;
    if (EXCLUDED_ANCESTOR_NODE_TYPES.has(name)) return true;
  }
  return false;
}

/**
 * Builds the DOM node rendered as a ProseMirror widget decoration for the
 * ghost suffix. Kept as a free function so tests can call it without spinning
 * up a view, and so the mousedown/touchstart event delegation can target a
 * stable `[data-ghost-completion="true"]` selector.
 *
 * ゴースト suffix を描画する DOM を生成する。テストでビューなしに呼べるよう
 * 自由関数化し、タップ判定で `[data-ghost-completion="true"]` セレクタが
 * 安定して効くようにする。
 */
export function buildGhostCompletionWidget(
  suffix: string,
  candidate: WikiLinkGhostCompletionCandidate,
): HTMLElement {
  const span = document.createElement("span");
  span.className = GHOST_CLASS;
  span.textContent = suffix;
  span.setAttribute(GHOST_DATA_ATTR, "true");
  span.setAttribute("data-target-id", candidate.id);
  // Prevent the caret from entering the widget — critical for IME and
  // mobile, where the browser may otherwise place the selection inside.
  // キャレットが widget 内部に入るのを防ぐ。IME / モバイルで重要。
  span.setAttribute("contenteditable", "false");
  return span;
}

/**
 * Pure-function transaction builder for the Tab / tap confirmation path.
 * Replaces the typed prefix with the full candidate title wrapped in a
 * `wikiLink` mark (`exists: true`, `targetId: candidate.id`), and sends a
 * `close` meta so the plugin collapses to inactive on the same transaction.
 *
 * Tab / タップ確定時のトランザクション生成。入力済み接頭辞を candidate の
 * 完全タイトルへ差し替え、`wikiLink` マーク（`exists: true`、
 * `targetId: candidate.id`）を付与する。同じトランザクションで `close`
 * メタを送ってプラグインを非アクティブに倒す。
 *
 * Exported for unit testing — the runtime path goes through
 * `confirmGhostCompletion`.
 *
 * 単体テスト目的でエクスポート。実行時は `confirmGhostCompletion` 経由。
 */
export function buildConfirmTransaction(
  state: EditorState,
  range: { from: number; to: number },
  candidate: WikiLinkGhostCompletionCandidate,
): Transaction | null {
  const wikiLinkMarkType = state.schema.marks.wikiLink;
  if (!wikiLinkMarkType) return null;
  const mark = wikiLinkMarkType.create({
    title: candidate.title,
    exists: true,
    referenced: false,
    targetId: candidate.id,
  });
  const tr = state.tr.replaceWith(range.from, range.to, state.schema.text(candidate.title, [mark]));
  // Place the cursor right after the inserted title so the user can keep
  // typing. `replaceWith` maps selection forward but we set it explicitly
  // for clarity (and to defeat any sticky-mark inheritance).
  // 挿入直後に caret を置く。マークの sticky inheritance を防ぐためにも明示。
  const cursorAt = range.from + candidate.title.length;
  tr.setSelection(TextSelection.create(tr.doc, cursorAt));
  // Strip stored marks so the user's next keystroke is not styled as a wikiLink.
  // 次の打鍵が wikiLink マークを引き継がないように storedMarks をクリア。
  tr.setStoredMarks([]);
  tr.setMeta(wikiLinkGhostCompletionPluginKey, { close: true });
  return tr;
}

/**
 * Runtime confirmation helper shared by the Tab handler and the
 * mousedown/touchstart delegation. Dispatches the transaction built by
 * {@link buildConfirmTransaction} on the editor view.
 *
 * Tab ハンドラと mousedown/touchstart 経由のタップ確定で共有する確定処理。
 * {@link buildConfirmTransaction} で組んだトランザクションを dispatch する。
 */
function confirmGhostCompletion(view: EditorView, state: WikiLinkGhostCompletionState): boolean {
  if (!state.active || !state.range || !state.candidate) return false;
  const tr = buildConfirmTransaction(view.state, state.range, state.candidate);
  if (!tr) return false;
  view.dispatch(tr);
  return true;
}

/**
 * ProseMirror plugin that shows an inline "ghost completion" while the user
 * types a plain word that prefix-matches an existing page title. Pressing
 * Tab (desktop) or tapping the chip (mobile) confirms by replacing the typed
 * prefix with the full title wrapped in a `wikiLink` mark.
 *
 * ユーザーが通常のテキストをタイプ中、既存ページタイトルの接頭辞に一致した
 * 単語があれば、その続きをインラインのゴーストテキストとしてカーソル右に
 * 表示する ProseMirror プラグイン。Tab（デスクトップ）またはチップタップ
 * （モバイル）で確定し、入力済み接頭辞をフルタイトルに置換、`wikiLink`
 * マーク（`exists: true`, `targetId: candidate.id`）を付与する。
 *
 * 設計は `wikiLinkSuggestionPlugin`（`[[...]]`）と `tagSuggestionPlugin`
 * （`#name`）と同形の Tiptap `Extension` + ProseMirror `Plugin`。`onStateChange`
 * で React 側に状態を流せるが、ポップオーバー UI は不要（widget 自体が UI）
 * のためホスト側に追加コンポーネントは不要。
 *
 * 抑止条件:
 * - 範囲選択中 / 入力中の単語が 2 文字未満 / IME 変換中（compositionstart で
 *   即時 close）
 * - コードブロック (`parent.type.spec.code`) / インラインコード
 *   (`code` mark) / `title` / `caption` などの本文外
 * - `wikiLinkSuggestionPlugin` / `tagSuggestionPlugin` / `slashSuggestionPlugin`
 *   のいずれかが active のとき（`[[`・`#`・`/` 入力が優先）
 * - 既存 `wikiLink` マーク内
 * - 単語の先頭が `[`, `]`, `#`, `@`, `/`（他フローへ譲る）
 * - 候補に prefix 一致するページがない、または完全一致で suffix が空
 *
 * 親 issue #924 §4 / 子 issue #930。
 */
export const WikiLinkGhostCompletionPlugin = Extension.create<WikiLinkGhostCompletionOptions>({
  name: "wikiLinkGhostCompletion",

  addOptions() {
    return {
      getCandidates: () => [],
      onStateChange: undefined,
      allowedNodeTypes: undefined,
    };
  },

  addProseMirrorPlugins() {
    const { onStateChange, getCandidates } = this.options;
    const allowedNodeTypes = this.options.allowedNodeTypes ?? DEFAULT_ALLOWED_NODE_TYPES;

    return [
      new Plugin<WikiLinkGhostCompletionState>({
        key: wikiLinkGhostCompletionPluginKey,

        state: {
          init() {
            return createInactiveState();
          },

          apply(tr, prev, _oldState, newState) {
            // Explicit close meta (Escape, confirm, compositionstart) wins
            // over everything else.
            // 明示的な close メタ（Esc / 確定 / IME 開始）は最優先で適用。
            if (tr.getMeta(wikiLinkGhostCompletionPluginKey)?.close) {
              return deactivate(prev, onStateChange);
            }

            // Context-level disqualifiers (selection / sibling plugins / node
            // type / existing mark). Bundled in `findContextSuppression` so
            // this branch list does not balloon the apply cyclomatic complexity.
            // 文脈レベルの抑止理由（選択 / 他プラグイン active / ノード種別 /
            // 既存マーク）はまとめてヘルパーで判定する。
            if (findContextSuppression(newState, allowedNodeTypes)) {
              return deactivate(prev, onStateChange);
            }

            const { $from } = newState.selection;
            const typedWord = extractTypedWord($from);
            if (!typedWord) {
              return deactivate(prev, onStateChange);
            }

            const candidate = findBestCandidate(typedWord, getCandidates());
            if (!candidate) {
              return deactivate(prev, onStateChange);
            }

            const suffix = candidate.title.slice(typedWord.length);
            if (suffix.length === 0) {
              return deactivate(prev, onStateChange);
            }

            const range = { from: $from.pos - typedWord.length, to: $from.pos };
            const widget = Decoration.widget(
              range.to,
              () => buildGhostCompletionWidget(suffix, candidate),
              {
                side: 1,
                ignoreSelection: true,
                // Stable key so ProseMirror reuses the DOM node when the
                // suffix is unchanged across rapid transactions → no flicker.
                // suffix 不変なら ProseMirror が DOM を再利用してフリッカ抑止。
                key: `ghost:${candidate.id}:${suffix}`,
              },
            );
            const decorations = DecorationSet.create(newState.doc, [widget]);

            const next: WikiLinkGhostCompletionState = {
              active: true,
              range,
              query: typedWord,
              candidate: {
                id: candidate.id,
                title: candidate.title,
                isDeleted: candidate.isDeleted,
              },
              suffix,
              decorations,
            };
            onStateChange?.(next);
            return next;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty;
          },

          handleKeyDown(view: EditorView, event: KeyboardEvent) {
            const pluginState = wikiLinkGhostCompletionPluginKey.getState(view.state);
            if (!pluginState?.active) return false;

            // Never interfere with IME composition.
            // IME 変換中は一切干渉しない。
            if (view.composing) return false;

            if (event.key === "Escape") {
              view.dispatch(
                view.state.tr.setMeta(wikiLinkGhostCompletionPluginKey, { close: true }),
              );
              return true;
            }

            if (
              event.key === "Tab" &&
              !event.shiftKey &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey
            ) {
              event.preventDefault();
              return confirmGhostCompletion(view, pluginState);
            }

            return false;
          },

          handleDOMEvents: {
            // Mobile chip tap / desktop mouse confirmation. Use mousedown
            // (not click) so we beat ProseMirror's own selection handling.
            // モバイルのチップタップ・デスクトップのマウス確定。`mousedown`
            // で ProseMirror の selection 処理より先に確定する。
            mousedown(view, event) {
              // `event.target` はテキストノードなど `Element` ではないことも
              // ある。`closest` を安全に呼ぶため `instanceof Element` で絞る。
              // Guard against non-Element targets (e.g. text nodes) so we can
              // safely call `closest` without runtime errors.
              const target = event.target;
              if (!(target instanceof Element)) return false;
              if (!target.closest(`[${GHOST_DATA_ATTR}="true"]`)) return false;
              const pluginState = wikiLinkGhostCompletionPluginKey.getState(view.state);
              if (!pluginState?.active) return false;
              event.preventDefault();
              return confirmGhostCompletion(view, pluginState);
            },

            touchstart(view, event) {
              // mousedown と同じ理由で `instanceof Element` ガード。
              // Same Element guard as mousedown above.
              const target = event.target;
              if (!(target instanceof Element)) return false;
              if (!target.closest(`[${GHOST_DATA_ATTR}="true"]`)) return false;
              const pluginState = wikiLinkGhostCompletionPluginKey.getState(view.state);
              if (!pluginState?.active) return false;
              event.preventDefault();
              return confirmGhostCompletion(view, pluginState);
            },

            // Dismiss the moment IME composition starts. The next apply after
            // `compositionend` re-evaluates against the committed text.
            // IME 変換開始時にゴーストを消す。`compositionend` 後は通常通り。
            compositionstart(view) {
              const pluginState = wikiLinkGhostCompletionPluginKey.getState(view.state);
              if (!pluginState?.active) return false;
              view.dispatch(
                view.state.tr.setMeta(wikiLinkGhostCompletionPluginKey, { close: true }),
              );
              return false;
            },
          },
        },
      }),
    ];
  },
});
