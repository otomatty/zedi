import React from "react";
import { Loader2 } from "lucide-react";
import { usePageEditor } from "./PageEditor/usePageEditor";
import { PageEditorLayout } from "./PageEditor/PageEditorLayout";

const LoadingSpinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

const PageEditor: React.FC = () => {
  const { showLoading, layoutProps } = usePageEditor();
  if (showLoading) return <LoadingSpinner />;
  return <PageEditorLayout {...layoutProps} />;
};

export default PageEditor;
