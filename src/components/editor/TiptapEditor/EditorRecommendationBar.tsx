import React from "react";
import Container from "@/components/layout/Container";
import type { EditorRecommendationBarProps } from "./EditorRecommendationBarTypes";
import { useEditorRecommendationBar } from "./useEditorRecommendationBar";
import { EditorRecommendationBarHeader } from "./EditorRecommendationBarHeader";
import { EditorRecommendationBarActions } from "./EditorRecommendationBarActions";
import { EditorRecommendationBarGenerating } from "./EditorRecommendationBarGenerating";
import { EditorRecommendationBarThumbnails } from "./EditorRecommendationBarThumbnails";

export const EditorRecommendationBar: React.FC<EditorRecommendationBarProps> = (props) => {
  const state = useEditorRecommendationBar(props);

  if (!state.canSearch) return null;
  if (state.isDismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container className="flex flex-col gap-2 py-2">
        <EditorRecommendationBarHeader
          headerLabel={state.headerLabel}
          mode={state.mode}
          nextCursor={state.nextCursor}
          isLoading={state.isLoading}
          onNextPage={state.handleNextPage}
          onBackToActions={state.handleBackToActions}
          onDismiss={state.dismiss}
        />

        {state.mode === "actions" && (
          <EditorRecommendationBarActions
            onOpenThumbnailPicker={state.handleOpenThumbnailPicker}
            onGenerateImage={state.handleGenerateImage}
            isLoading={state.isLoading}
          />
        )}

        {state.mode === "generating" && (
          <EditorRecommendationBarGenerating
            isLoading={state.isLoading}
            errorMessage={state.errorMessage}
            onBackToActions={state.handleBackToActions}
          />
        )}

        {state.mode === "thumbnails" && (
          <EditorRecommendationBarThumbnails
            candidates={state.candidates}
            isLoading={state.isLoading}
            errorMessage={state.errorMessage}
            scrollRef={state.scrollRef}
            onWheel={state.handleWheel}
            onSelectCandidate={state.handleSelectCandidate}
          />
        )}
      </Container>
    </div>
  );
};
