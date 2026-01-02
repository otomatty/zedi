import { useEffect, useRef } from "react";
import { Editor } from "@tiptap/react";
import {
  extractWikiLinksFromContent,
  getUniqueWikiLinkTitles,
} from "@/lib/wikiLinkUtils";
import { useWikiLinkExistsChecker } from "@/hooks/usePageQueries";
import {
  debugLog,
  debugWarn,
  debugGroup,
  debugGroupEnd,
} from "@/lib/debugUtils";

interface UseWikiLinkStatusSyncOptions {
  editor: Editor | null;
  content: string;
  pageId: string | undefined;
  onChange: (content: string) => void;
}

/**
 * Hook to sync WikiLink exists and referenced status
 * Updates WikiLink marks in the editor when page loads
 */
export function useWikiLinkStatusSync({
  editor,
  content,
  pageId,
  onChange,
}: UseWikiLinkStatusSyncOptions): void {
  const { checkExistence } = useWikiLinkExistsChecker();
  // Track if WikiLink status has been updated for current pageId
  const wikiLinkStatusUpdatedRef = useRef<string | null>(null);

  // Update WikiLink exists and referenced status when page loads
  useEffect(() => {
    if (!editor || !content || !pageId) return;

    // Skip if already updated for this page
    if (wikiLinkStatusUpdatedRef.current === pageId) return;

    const updateWikiLinkStatus = async () => {
      // Extract all WikiLinks from content
      const wikiLinks = extractWikiLinksFromContent(content);

      if (wikiLinks.length === 0) {
        debugGroupEnd();
        wikiLinkStatusUpdatedRef.current = pageId;
        return;
      }

      // Get unique titles to check
      const titles = getUniqueWikiLinkTitles(wikiLinks);

      // Check existence and referenced status for all titles
      const { pageTitles, referencedTitles } = await checkExistence(
        titles,
        pageId
      );

      // If pageTitles is empty, the check might not be ready yet - retry later
      // But only if we have titles to check
      if (pageTitles.size === 0 && titles.length > 0) {
        // Don't mark as updated - will retry on next render
        return;
      }

      // Find and update WikiLink marks in the document
      const { doc } = editor.state;
      const updates: Array<{
        from: number;
        to: number;
        exists: boolean;
        referenced: boolean;
        title: string;
        oldExists: boolean;
        oldReferenced: boolean;
      }> = [];

      doc.descendants((node, pos) => {
        if (node.isText && node.marks.length > 0) {
          node.marks.forEach((mark) => {
            if (mark.type.name === "wikiLink") {
              const normalizedTitle = (mark.attrs.title as string)
                .toLowerCase()
                .trim();
              const newExists = pageTitles.has(normalizedTitle);
              const newReferenced = referencedTitles.has(normalizedTitle);

              // Only update if status changed
              if (
                mark.attrs.exists !== newExists ||
                mark.attrs.referenced !== newReferenced
              ) {
                updates.push({
                  from: pos,
                  to: pos + node.nodeSize,
                  exists: newExists,
                  referenced: newReferenced,
                  title: mark.attrs.title,
                  oldExists: mark.attrs.exists,
                  oldReferenced: mark.attrs.referenced,
                });
              }
            }
          });
        }
      });

      // Mark as updated for this page
      wikiLinkStatusUpdatedRef.current = pageId;

      // Apply updates (in reverse order to maintain positions)
      if (updates.length > 0) {
        for (const update of updates.reverse()) {
          editor
            .chain()
            .setTextSelection({ from: update.from, to: update.to })
            .extendMarkRange("wikiLink")
            .updateAttributes("wikiLink", {
              exists: update.exists,
              referenced: update.referenced,
            })
            .run();
        }

        // Trigger onChange to persist the changes
        const json = JSON.stringify(editor.getJSON());
        onChange(json);
      }
      debugGroupEnd();
    };

    // Run after a short delay to ensure content is loaded
    const timer = setTimeout(updateWikiLinkStatus, 150);
    return () => clearTimeout(timer);
  }, [editor, content, checkExistence, pageId, onChange]);
}
