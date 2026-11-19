import type { LucideIcon } from "lucide-react";
import type React from "react";

/**
 * ハブ内で表示するアクションの呼び出しコンテキスト。`useTiptapEditorController`
 * 内で組み立て、`PageActionHub` に渡される。レジストリの `isAvailable` ゲートと
 * 各アクションコンポーネントの両方が参照する。
 *
 * Runtime context passed to PageActionHub actions. Assembled inside
 * `useTiptapEditorController` and forwarded to `PageActionHub`. Consumed both
 * by the registry's `isAvailable` gates and by each action component.
 */
export interface PageActionContext {
  /** 編集中ページのタイトル。検索/生成のクエリに使用する。 / Editing page title used as the search/generate query. */
  pageTitle: string;
  /** 読み取り専用モードかどうか。 / Whether the editor is in read-only mode. */
  isReadOnly: boolean;
  /** サインイン済みかどうか。 / Whether the viewer is signed in. */
  isSignedIn: boolean;
  /** 既にサムネイルが本文先頭に挿入済みかどうか。 / Whether the page already has a thumbnail. */
  hasThumbnail: boolean;
  /**
   * 本文先頭にサムネイル画像を挿入するハンドラ。既存
   * `useThumbnailController` が返す `handleInsertThumbnailImage` を委譲する。
   *
   * Inserts the chosen thumbnail at the top of the editor document. Delegates
   * to the existing `useThumbnailController`'s `handleInsertThumbnailImage`.
   */
  insertThumbnail: (imageUrl: string, alt: string, previewUrl?: string) => void;
}

/**
 * 一覧→詳細のビュー状態。`{ kind: "list" }` を初期値とし、ユーザがカードを
 * クリックすると `{ kind: "detail", actionId }` に遷移する。
 *
 * Two-step view state. Starts as `{ kind: "list" }`; selecting a card moves
 * to `{ kind: "detail", actionId }`.
 */
export type PageActionView = { kind: "list" } | { kind: "detail"; actionId: string };

/**
 * `PageActionHub` を親から命令的に開閉するためのハンドル。`insertAtCursorRef`
 * と同パターンで `useEffect` 内で `ref.current` に代入される。
 *
 * Imperative handle exposed by `PageActionHub`. Parent components (FAB)
 * assign the handle through a ref, mirroring the `insertAtCursorRef` pattern.
 */
export interface PageActionHubHandle {
  open: () => void;
  close: () => void;
}

/**
 * 各アクションコンポーネントが受け取る共通 props。
 * Common props passed to every action component rendered inside the hub.
 */
export interface PageActionComponentProps {
  ctx: PageActionContext;
  /** ハブ全体を閉じる（成功時等に使用）。 / Close the entire hub. */
  onClose: () => void;
  /** 一覧ビューに戻る。 / Pop back to the list view. */
  onBackToList: () => void;
}

/**
 * レジストリに登録されるアクション記述。`Component` が詳細ビューを描画する。
 * `insertStrategy` は Phase 1 では宣言のみで、実際の挿入位置は各アクション
 * コンポーネントが委譲する `ctx.insertThumbnail` 等の中で決まる。汎用 dispatch
 * ヘルパは後続フェーズで導入する。
 *
 * Registry descriptor for a hub action. `Component` renders the detail view.
 * `insertStrategy` is purely descriptive in Phase 1 — actual insert positions
 * are decided inside the methods on `ctx` (e.g. `insertThumbnail`). A generic
 * dispatcher will arrive in later phases once a second strategy is needed.
 */
export interface PageAction {
  id: string;
  labelI18nKey: string;
  descriptionI18nKey?: string;
  icon: LucideIcon;
  category: "thumbnail" | "import" | "ai" | "template" | "other";
  insertStrategy: "cursor" | "head" | "custom";
  isAvailable: (ctx: PageActionContext) => boolean;
  Component: React.ComponentType<PageActionComponentProps>;
}
