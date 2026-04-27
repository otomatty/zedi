import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { cn } from "@zedi/ui";
import { Hash, Plus } from "lucide-react";
import type { TagSuggestionCandidate } from "@/hooks/useTagCandidates";

/**
 * 表示用の 1 アイテム。`exists=true` は既存ページに対応するタグ、`exists=false`
 * は「このタグ名で確定する（新規 / ゴースト）」を示す。
 *
 * One row in the tag suggestion popover. `exists=false` represents the
 * "create / accept as ghost" path — the same UX shape as
 * `WikiLinkSuggestion`'s "create new" item.
 */
export interface TagSuggestionItem {
  /** Display + insertion name (no leading `#`). 表示と挿入用の名前。 */
  name: string;
  /** 同名ページがスコープ内に存在するか / page with this name exists in scope */
  exists: boolean;
  /**
   * 解決済みターゲットページ id。`exists === true` のときのみ非 null。
   * Resolved target page id; non-null only when `exists === true`.
   */
  targetId: string | null;
}

interface TagSuggestionProps {
  query: string;
  /**
   * `#name` 全体のドキュメント内範囲。確定時の置換に使うが、本コンポーネントは
   * 表示のみ担当するためここでは保持しない（呼び出し側が `onSelect` で利用）。
   *
   * Document range covering `#name`. Consumed by the caller via `onSelect`;
   * this component doesn't read it directly but keeps the prop so the parent
   * layer matches `WikiLinkSuggestion`'s shape (issue #767 review feedback).
   */
  range: { from: number; to: number };
  onSelect: (item: TagSuggestionItem) => void;
  onClose: () => void;
  /**
   * 呼び出し側がスコープ別に絞り込んだ候補。`useTagCandidates` の出力を
   * そのまま渡す。
   *
   * Pre-scoped candidates supplied by the caller (typically the result of
   * `useTagCandidates`). The component stays pure-presentation so scope
   * decisions live in the host.
   */
  candidates: TagSuggestionCandidate[];
}

/**
 * `onKeyDown` が `true` を返すと呼び出し元は既定のキーハンドリングを抑止する。
 * Imperative handle exposing `onKeyDown`; returning `true` tells the editor
 * to suppress default key handling.
 */
export interface TagSuggestionHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const MAX_VISIBLE = 5;

/**
 * `#name` 用のサジェストポップアップ。WikiLink 用 `WikiLinkSuggestion` と
 * 同じ操作モデル（矢印キーで移動、Enter / Tab で確定、Esc で閉じる）。
 * 候補は呼び出し側で大文字小文字無視のスコープ絞り込み済みのものを受け取り、
 * 本コンポーネントは表示と確定だけを担当する。
 *
 * Tag (`#name`) suggestion popup. Mirrors `WikiLinkSuggestion`'s key model
 * (arrows to move, Enter / Tab to confirm, Esc to close). Candidates are
 * pre-scoped + de-duplicated by the caller; this component only renders and
 * forwards the confirm signal. See issue #767 (Phase 2).
 */
export const TagSuggestion = forwardRef<TagSuggestionHandle, TagSuggestionProps>(
  ({ query, candidates, onSelect, onClose }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const items = useMemo<TagSuggestionItem[]>(() => {
      const normalized = query.trim().toLowerCase();
      // `MAX_VISIBLE` のスライス前に「完全一致を先頭」へ並べ替えるのが要点。
      // これをやらないと、6 件目以降に完全一致がいた場合に表示から漏れたうえで
      // `exactMatch` が truthy になり「新規作成」項目も追加されないため、ユーザが
      // 完全一致候補を選択できなくなる（gemini-code-assist のレビュー指摘）。
      // Sort exact-match candidates to the front BEFORE slicing to MAX_VISIBLE.
      // Without this, a candidate matching the query exactly but sitting outside
      // the first 5 includes-matches gets dropped from the visible list while
      // `exactMatch` is still truthy, so the "create new" fallback also doesn't
      // fire — leaving the user unable to select the exact tag (gemini review).
      const filtered = normalized
        ? candidates.filter((c) => c.name.toLowerCase().includes(normalized))
        : candidates;
      const sorted = [...filtered].sort((a, b) => {
        const aExact = a.name.toLowerCase() === normalized;
        const bExact = b.name.toLowerCase() === normalized;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      });
      const matching = sorted.slice(0, MAX_VISIBLE).map<TagSuggestionItem>((c) => ({
        name: c.name,
        exists: c.exists,
        targetId: c.targetId,
      }));

      const exactMatch = candidates.find((c) => c.name.toLowerCase() === normalized);
      const result = [...matching];
      if (query.trim() && !exactMatch) {
        result.push({ name: query.trim(), exists: false, targetId: null });
      }
      return result;
    }, [query, candidates]);

    // クエリ変更ごとに選択位置をリセット。再描画後に走るよう microtask で
    // 倒すのは `WikiLinkSuggestion` と同じ手法（ちらつき防止）。
    // Reset highlight on every query change; same microtask trick as
    // `WikiLinkSuggestion` to avoid intermediate flicker.
    useEffect(() => {
      queueMicrotask(() => setSelectedIndex(0));
    }, [query]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) onSelect(item);
      },
      [items, onSelect],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (items.length === 0) {
          // Esc は常に閉じる、それ以外は素通し（タイピング継続を妨げない）。
          // Esc still closes; everything else falls through to keep typing.
          if (event.key === "Escape") {
            onClose();
            return true;
          }
          return false;
        }

        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
          return true;
        }

        if (event.key === "Enter" || event.key === "Tab") {
          // Enter / Tab どちらでも確定する（受け入れ条件）。
          // Both Enter and Tab confirm — matches the issue's acceptance criteria.
          selectItem(selectedIndex);
          return true;
        }

        if (event.key === "Escape") {
          onClose();
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return null;
    }

    return (
      <div
        data-testid="tag-suggestion"
        className="shadow-elevated animate-fade-in border-border bg-popover max-w-[300px] min-w-[200px] overflow-hidden rounded-lg border"
      >
        <div className="p-1">
          {items.map((item, index) => (
            <button
              key={`${item.name}-${item.exists ? "ex" : "new"}-${item.targetId ?? "none"}`}
              onClick={() => selectItem(index)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              {item.exists ? (
                <Hash className="text-muted-foreground h-4 w-4 shrink-0" />
              ) : (
                <Plus className="text-primary h-4 w-4 shrink-0" />
              )}
              <span className="truncate">
                {item.exists ? `#${item.name}` : `"#${item.name}" を作成`}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  },
);

TagSuggestion.displayName = "TagSuggestion";
