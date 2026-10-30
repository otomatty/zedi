/**
 * Visual for a `[[WikiLink]]` node view: a link when the target exists, a ghost otherwise.
 * WikiLink ノードの表示。リンク先があればリンク、なければゴースト表示。
 */
export function WikiLinkChip(props: { title: string; targetId: string | null }) {
  return props.targetId ? (
    <a class="wiki-chip" href={`/notes/${props.targetId}`}>
      {props.title}
    </a>
  ) : (
    <span class="wiki-chip ghost">{props.title}</span>
  );
}
