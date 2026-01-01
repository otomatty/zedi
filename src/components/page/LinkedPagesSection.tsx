import { useNavigate } from "react-router-dom";
import { Link2, ArrowLeft, Globe, ChevronDown, FilePlus } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkSection } from "./LinkSection";
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
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

  const { outgoingLinks, backlinks, twoHopLinks, ghostLinks } = data;
  const hasAnyLinks =
    outgoingLinks.length > 0 ||
    backlinks.length > 0 ||
    twoHopLinks.length > 0 ||
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
      {/* Outgoing Links */}
      {outgoingLinks.length > 0 && (
        <LinkSection
          title="リンク先"
          icon={<Link2 className="h-4 w-4" />}
          pages={outgoingLinks}
          onPageClick={handlePageClick}
        />
      )}

      {/* Ghost Links */}
      {ghostLinks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FilePlus className="h-4 w-4" />
            <span>未作成のリンク ({ghostLinks.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

      {/* Backlinks */}
      {backlinks.length > 0 && (
        <LinkSection
          title="被リンク"
          icon={<ArrowLeft className="h-4 w-4" />}
          pages={backlinks}
          onPageClick={handlePageClick}
        />
      )}

      {/* 2-hop Links */}
      {twoHopLinks.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <Globe className="h-4 w-4" />
            <span>2階層先 ({twoHopLinks.length})</span>
            <ChevronDown className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <LinkSection pages={twoHopLinks} onPageClick={handlePageClick} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
