import React, { useCallback } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import type { StorageProviderInfo } from "@/types/storage";
import { cn } from "@/lib/utils";

interface StorageStatusHeaderProps {
  currentStorageProvider?: StorageProviderInfo;
  isStorageConfigured: boolean;
  isStorageLoading: boolean;
  onGoToStorageSettings: () => void;
  className?: string;
}

export const StorageStatusHeader: React.FC<StorageStatusHeaderProps> = ({
  currentStorageProvider,
  isStorageConfigured,
  isStorageLoading,
  onGoToStorageSettings,
  className,
}) => {
  const storageProviderLabel = currentStorageProvider?.name ?? "未設定";
  const storageStatusLabel = isStorageConfigured ? "接続済み" : "未設定";
  const storageStatusVariant = isStorageConfigured ? "secondary" : "outline";
  const storageDescription =
    currentStorageProvider?.description || "ストレージが未設定です。";

  const handleStorageHeaderClick = useCallback(() => {
    if (isStorageLoading) return;
    if (!isStorageConfigured) {
      onGoToStorageSettings();
    }
  }, [isStorageConfigured, isStorageLoading, onGoToStorageSettings]);

  const handleStorageHeaderKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isStorageLoading || isStorageConfigured) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onGoToStorageSettings();
      }
    },
    [isStorageConfigured, isStorageLoading, onGoToStorageSettings]
  );

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs",
            !isStorageConfigured && !isStorageLoading && "cursor-pointer",
            className
          )}
          onClick={handleStorageHeaderClick}
          onKeyDown={handleStorageHeaderKeyDown}
          role={!isStorageConfigured && !isStorageLoading ? "button" : undefined}
          tabIndex={!isStorageConfigured && !isStorageLoading ? 0 : undefined}
        >
          <Badge variant="outline">{storageProviderLabel}</Badge>
          <Badge variant={storageStatusVariant}>{storageStatusLabel}</Badge>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">{storageDescription}</p>
        <Button size="sm" variant="outline" onClick={onGoToStorageSettings}>
          <Settings className="h-4 w-4 mr-1" />
          設定
        </Button>
      </HoverCardContent>
    </HoverCard>
  );
};
