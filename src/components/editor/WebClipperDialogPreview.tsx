import React from "react";
import { Check } from "lucide-react";
import { Alert, AlertDescription } from "@zedi/ui";
import type { ClippedContent } from "@/lib/webClipper";

interface WebClipperDialogPreviewProps {
  clippedContent: ClippedContent;
}

export const WebClipperDialogPreview: React.FC<WebClipperDialogPreviewProps> = ({
  clippedContent,
}) => (
  <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
    <Check className="h-4 w-4 text-green-600" />
    <AlertDescription className="text-green-800 dark:text-green-200">
      <div className="space-y-1">
        <div className="font-medium">{clippedContent.title}</div>
        {clippedContent.siteName && (
          <div className="text-xs opacity-70">{clippedContent.siteName}</div>
        )}
      </div>
    </AlertDescription>
  </Alert>
);
