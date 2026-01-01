import { useNavigate } from "react-router-dom";
import { Link2, FilePlus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkSection } from "./LinkSection";
import { LinkGroupRow } from "./LinkGroupRow";
import { GhostLinkCard } from "./GhostLinkCard";
import { useLinkedPages } from "@/hooks/useLinkedPages";
import { useCreatePage } from "@/hooks/usePageQueries";

interface LinkedPagesSectionProps {
  pageId: string;
}

function LinkedPagesSkeleton() {
  return (
    <div className="border-t pt-6 mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

export function LinkedPagesSection({ pageId }: LinkedPagesSectionProps) {
  const { data, isLoading } = useLinkedPages(pageId);
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();

  if (isLoading) {
    return <LinkedPagesSkeleton />;
  }

  if (!data) return null;

  const { outgoingLinks, outgoingLinksWithChildren, backlinks, ghostLinks } =
    data;

  // Combine outgoing links (without children) and backlinks into "リンク" section
  const allLinks = [...outgoingLinks, ...backlinks];

  const hasAnyLinks =
    allLinks.length > 0 ||
    outgoingLinksWithChildren.length > 0 ||
    ghostLinks.length > 0;

  if (!hasAnyLinks) return null;

  const handlePageClick = (id: string) => {
    navigate(`/page/${id}`);
  };

  const handleGhostLinkClick = async (title: string) => {
    // Create a new page with the ghost link title
    try {
      const newPage = await createPageMutation.mutateAsync({ title });
      navigate(`/page/${newPage.id}`);
    } catch (error) {
      console.error("Failed to create page:", error);
    }
  };

  return (
    <div className="border-t pt-6 mt-6 space-y-6">
      {/* Links with 2-hop children (horizontal layout) */}
      {outgoingLinksWithChildren.length > 0 && (
        <div className="space-y-4">
          {outgoingLinksWithChildren.map((linkGroup) => (
            <LinkGroupRow
              key={linkGroup.source.id}
              linkGroup={linkGroup}
              onPageClick={handlePageClick}
            />
          ))}
        </div>
      )}

      {/* Combined Links section (outgoing without children + backlinks) */}
      {allLinks.length > 0 && (
        <LinkSection
          title="リンク"
          icon={<Link2 className="h-4 w-4" />}
          pages={allLinks}
          onPageClick={handlePageClick}
        />
      )}

      {/* Ghost Links (renamed to 新しいリンク) */}
      {ghostLinks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FilePlus className="h-4 w-4" />
            <span>新しいリンク ({ghostLinks.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {ghostLinks.map((title) => (
              <GhostLinkCard
                key={title}
                title={title}
                onClick={() => handleGhostLinkClick(title)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
