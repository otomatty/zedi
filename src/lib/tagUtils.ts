/**
 * Utilities for extracting and updating tag marks inside Tiptap JSON content.
 * Mirrors `./wikiLinkUtils.ts` since tag marks share the same data
 * model (`links` / `ghost_links` tables with `link_type = 'tag'`). See
 * issue #725 (Phase 1).
 *
 * Tiptap JSON 内のタグマークを抽出・更新するユーティリティ。タグと
 * WikiLink はデータモデル（`links` / `ghost_links` の `link_type = 'tag'`）
 * を共有するため、実装は `./wikiLinkUtils.ts` と対をなす。Issue #725。
 */

/**
 * Minimal shape of a tag mark consumed by sync/render flows. `exists`
 * indicates whether a page named after the tag resolves in the current scope;
 * `referenced` tracks whether the same tag appears on other pages.
 *
 * 同期・描画フローで扱うタグマークの最小形。`exists` はタグ名と同名のページが
 * 現在のスコープで解決できるか、`referenced` は他ページでも同じタグが使われて
 * いるかを表す。
 */
export interface TagInfo {
  name: string;
  exists: boolean;
  referenced: boolean;
}

/**
 * Return the trimmed tag name when the raw attribute is a non-empty string,
 * otherwise `null`. Guards against non-string or whitespace-only `attrs.name`
 * values slipping into downstream `.toLowerCase()` calls.
 *
 * `attrs.name` が非空文字列のときにトリム済みの値を、それ以外のとき `null`
 * を返す。`.toLowerCase()` など後続処理が落ちないよう型ガードとして使う。
 */
function normalizeTagNameAttr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extract tag marks from a Tiptap JSON string.
 * Tiptap JSON 文字列からタグマークを抽出する。
 *
 * Returns an empty array when the input is empty, not valid JSON, or contains
 * no `tag` marks. Traversal order follows document order so callers can rely
 * on stable positioning when displaying results.
 */
export function extractTagsFromContent(content: string): TagInfo[] {
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    const tags: TagInfo[] = [];

    const traverse = (node: unknown) => {
      if (!node || typeof node !== "object") return;

      const n = node as Record<string, unknown>;

      if (Array.isArray(n.marks)) {
        for (const mark of n.marks) {
          if (
            mark &&
            typeof mark === "object" &&
            (mark as Record<string, unknown>).type === "tag"
          ) {
            const attrs = (mark as Record<string, unknown>).attrs as
              | Record<string, unknown>
              | undefined;
            const name = normalizeTagNameAttr(attrs?.name);
            if (name) {
              tags.push({
                name,
                exists: Boolean(attrs?.exists),
                referenced: Boolean(attrs?.referenced),
              });
            }
          }
        }
      }

      if (Array.isArray(n.content)) {
        for (const child of n.content) {
          traverse(child);
        }
      }
    };

    traverse(parsed);
    return tags;
  } catch {
    return [];
  }
}

/**
 * Update `exists` / `referenced` attributes on every tag mark inside the
 * given Tiptap JSON. `pageTitles` and `referencedTitles` are pre-normalized
 * (lowercased + trimmed) sets of page titles that the caller has resolved
 * against the repository.
 *
 * 指定した Tiptap JSON 内の全タグマークについて `exists` / `referenced`
 * 属性を更新する。`pageTitles` / `referencedTitles` は呼び出し側で解決済みの
 * ページタイトル集合（小文字・トリム正規化済み）。
 *
 * `pageTitleToId` を渡すと、解決時に `targetId` 属性も埋める（issue #737）。
 * 省略時は既存の `targetId` を温存する。
 * Pass `pageTitleToId` (issue #737) to also populate the `targetId`
 * attribute on resolved marks; omitted → preserve existing id.
 *
 * @returns 更新後の JSON と、属性変更が発生したかどうか。
 *          The updated JSON and a flag indicating whether any mark changed.
 */
export function updateTagAttributes(
  content: string,
  pageTitles: Set<string>,
  referencedTitles: Set<string>,
  pageTitleToId?: Map<string, string>,
): { content: string; hasChanges: boolean } {
  if (!content) return { content, hasChanges: false };

  try {
    const parsed = JSON.parse(content);
    let hasChanges = false;

    const traverse = (node: unknown): unknown => {
      if (!node || typeof node !== "object") return node;

      const n = { ...(node as Record<string, unknown>) };

      if (Array.isArray(n.marks)) {
        n.marks = n.marks.map((mark) => {
          if (
            mark &&
            typeof mark === "object" &&
            (mark as Record<string, unknown>).type === "tag"
          ) {
            const attrs = (mark as Record<string, unknown>).attrs as
              | Record<string, unknown>
              | undefined;
            const name = normalizeTagNameAttr(attrs?.name);
            if (name && attrs) {
              const normalizedName = name.toLowerCase();
              const newExists = pageTitles.has(normalizedName);
              const newReferenced = referencedTitles.has(normalizedName);
              // 解決済みターゲット ID を埋める (issue #737)。`null` のまま
              // 上書きしない (既存値温存) ため、resolved 時のみ書き換え対象。
              // Populate the resolved target id (issue #737). Never overwrite
              // an existing id with `null`; only update when resolved.
              const resolvedTargetId =
                newExists && pageTitleToId !== undefined
                  ? (pageTitleToId.get(normalizedName) ?? null)
                  : null;
              const currentTargetId = typeof attrs.targetId === "string" ? attrs.targetId : null;
              const targetIdChanged =
                resolvedTargetId !== null && resolvedTargetId !== currentTargetId;

              if (
                attrs.exists !== newExists ||
                attrs.referenced !== newReferenced ||
                targetIdChanged
              ) {
                hasChanges = true;
                const nextAttrs: Record<string, unknown> = {
                  ...attrs,
                  exists: newExists,
                  referenced: newReferenced,
                };
                if (targetIdChanged) {
                  nextAttrs.targetId = resolvedTargetId;
                }
                return {
                  ...mark,
                  attrs: nextAttrs,
                };
              }
            }
          }
          return mark;
        });
      }

      if (Array.isArray(n.content)) {
        n.content = n.content.map(traverse);
      }

      return n;
    };

    const updated = traverse(parsed);
    // 変更が無いときは元の文字列をそのまま返し、等価だが整形が違う JSON で
    // 書き直して余計な差分を呼び出し側に伝播させないようにする。
    // When nothing changed, return the original content unchanged instead of
    // re-stringifying into a potentially minified equivalent; avoids spurious
    // "content changed" signals for downstream consumers.
    if (!hasChanges) {
      return { content, hasChanges: false };
    }
    return {
      content: JSON.stringify(updated),
      hasChanges,
    };
  } catch {
    return { content, hasChanges: false };
  }
}

/**
 * Deduplicate tag names case-insensitively while preserving the casing of the
 * first occurrence and the original insertion order.
 *
 * タグ名リストから大文字小文字を区別せず重複を除き、最初の出現時の表記と
 * 挿入順を保ったままユニーク化する。
 */
export function getUniqueTagNames(tags: TagInfo[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalized = tag.name.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(tag.name);
    }
  }

  return result;
}
