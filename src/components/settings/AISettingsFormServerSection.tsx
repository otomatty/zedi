import React from "react";
import { Server, Lock, Loader2 } from "lucide-react";
import { Button } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@zedi/ui";
import { Alert, AlertDescription, AlertTitle } from "@zedi/ui";
import { Badge } from "@zedi/ui";
import { getSonnetBaseline, formatCostMultiplierLabel } from "@/lib/aiCostUtils";
import type { AIModel } from "@/types/ai";
import { useTranslation } from "react-i18next";

interface AISettingsFormServerSectionProps {
  serverModels: AIModel[];
  serverModelsError: string | null;
  serverModelsLoading: boolean;
  currentModelId: string;
  isSaving: boolean;
  onLoadServerModels: (forceRefresh?: boolean) => void;
  onServerModelSelect: (modelId: string) => void;
}

export const AISettingsFormServerSection: React.FC<AISettingsFormServerSectionProps> = ({
  serverModels,
  serverModelsError,
  serverModelsLoading,
  currentModelId,
  isSaving,
  onLoadServerModels,
  onServerModelSelect,
}) => {
  const { t } = useTranslation();
  const availableServerModels = serverModels.filter((m) => m.available);
  const lockedServerModels = serverModels.filter((m) => !m.available);
  const sonnetBaseline = getSonnetBaseline(serverModels);
  const getCostLabel = (model: AIModel) =>
    formatCostMultiplierLabel(model.inputCostUnits, sonnetBaseline);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-primary" />
        <Label>{t("aiSettings.aiModel")}</Label>
      </div>

      {serverModelsError && (
        <Alert variant="destructive" className="flex flex-col gap-2">
          <AlertTitle>{t("aiSettings.modelsLoadFailed")}</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap font-mono text-xs">
            {serverModelsError}
          </AlertDescription>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => onLoadServerModels(true)}
          >
            {t("aiSettings.retryLoadModels")}
          </Button>
        </Alert>
      )}
      {serverModelsLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("aiSettings.loadingModels")}
        </div>
      ) : !serverModelsError ? (
        <Select
          value={currentModelId ? currentModelId : undefined}
          onValueChange={onServerModelSelect}
          disabled={isSaving}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("aiSettings.selectModel")} />
          </SelectTrigger>
          <SelectContent>
            {availableServerModels.length > 0 &&
              availableServerModels.map((model) => {
                const costLabel = getCostLabel(model);
                const isCheaperOrBaseline = model.inputCostUnits <= sonnetBaseline;
                return (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex items-center gap-2">
                      <span>{model.displayName}</span>
                      <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                        {model.provider}
                      </Badge>
                      <Badge
                        variant={isCheaperOrBaseline ? "default" : "outline"}
                        className="px-1 py-0 text-[10px]"
                      >
                        {costLabel}
                      </Badge>
                    </div>
                  </SelectItem>
                );
              })}
            {lockedServerModels.length > 0 &&
              lockedServerModels.map((model) => {
                const costLabel = getCostLabel(model);
                return (
                  <SelectItem key={model.id} value={model.id} disabled>
                    <div className="flex items-center gap-2">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{model.displayName}</span>
                      <Badge variant="outline" className="px-1 py-0 text-[10px]">
                        {t("aiSettings.pro")}
                      </Badge>
                      <Badge variant="outline" className="px-1 py-0 text-[10px]">
                        {costLabel}
                      </Badge>
                    </div>
                  </SelectItem>
                );
              })}
          </SelectContent>
        </Select>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("aiSettings.serverModeHelp")}</p>
    </div>
  );
};
