import { Link } from "react-router-dom";
import { usePageStore } from "../../stores/pageStore";

interface AIChatWikiLinkProps {
  /** WikiLink title (e.g. from [[Title]]) */
  title: string;
}

/**
 * Renders a clickable WikiLink in AI chat. Resolves title to page id;
 * existing pages link to /page/:id, missing pages render as ghost style.
 */
export function AIChatWikiLink({ title }: AIChatWikiLinkProps) {
  const normalizedTitle = title.trim();
  const page = usePageStore((state) => state.getPageByTitle(normalizedTitle));

  if (page) {
    return (
      <Link
        to={`/page/${page.id}`}
        className="rounded px-0.5 font-medium text-primary underline decoration-primary/50 underline-offset-2 transition-colors hover:decoration-primary"
      >
        [[{normalizedTitle}]]
      </Link>
    );
  }

  return (
    <span className="rounded px-0.5 font-medium text-muted-foreground underline decoration-muted-foreground/60 decoration-dashed underline-offset-2">
      [[{normalizedTitle}]]
    </span>
  );
}
