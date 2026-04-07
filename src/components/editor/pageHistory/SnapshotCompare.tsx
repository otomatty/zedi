/**
 * スナップショット並列比較ビュー（side-by-side）
 * Side-by-side comparison of selected snapshot vs current content
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { SnapshotPreview } from "./SnapshotPreview";

interface SnapshotCompareProps {
  /** 選択したスナップショットの Y.Doc state (base64) */
  selectedYdocState: string;
  /** 現在のページの Y.Doc state (base64) */
  currentYdocState: string;
}

/**
 *
 */
export /**
 *
 */
const SnapshotCompare: React.FC<SnapshotCompareProps> = ({
  selectedYdocState,
  currentYdocState,
}) => {
  /**
   *
   */
  const { t } = useTranslation();

  return (
    <div className="grid h-full grid-cols-2 gap-4">
      <div className="flex flex-col overflow-hidden rounded-md border">
        <div className="bg-muted/50 border-b px-3 py-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            {t("editor.pageHistory.selectedVersion")}
          </span>
        </div>
        <div className="flex-1 overflow-auto p-3">
          <SnapshotPreview ydocState={selectedYdocState} />
        </div>
      </div>
      <div className="flex flex-col overflow-hidden rounded-md border">
        <div className="bg-muted/50 border-b px-3 py-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            {t("editor.pageHistory.currentVersion")}
          </span>
        </div>
        <div className="flex-1 overflow-auto p-3">
          <SnapshotPreview ydocState={currentYdocState} />
        </div>
      </div>
    </div>
  );
};
