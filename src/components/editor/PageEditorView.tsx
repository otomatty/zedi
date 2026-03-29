import React from "react";
import { Loader2 } from "lucide-react";
import { usePageEditor } from "./PageEditor/usePageEditor";
import { PageEditorLayout } from "./PageEditor/PageEditorLayout";

const LoadingSpinner = () => (
  <div className="bg-background flex min-h-screen items-center justify-center">
    <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
  </div>
);

/**
 *
 */
const PageEditor: React.FC = () => {
  const { showLoading, layoutProps } = usePageEditor();
  if (showLoading) return <LoadingSpinner />;
  return <PageEditorLayout {...layoutProps} />;
};

export default PageEditor;
