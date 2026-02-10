import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Lock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fetchServerModels } from "@/lib/aiService";
import type { AIModel } from "@/types/ai";

interface ModelSelectorProps {
  value: string; // model_id e.g. "openai:gpt-4o-mini"
  onValueChange: (modelId: string, model: AIModel) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * ティア対応のAIモデル選択コンポーネント
 * サーバーからモデル一覧を取得し、ユーザーのティアに応じてフィルタ表示
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onValueChange,
  disabled,
  className,
}) => {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);

  const loadModels = useCallback(async () => {
    try {
      const { models: serverModels } = await fetchServerModels();
      setModels(serverModels);
    } catch {
      // Failed to load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const handleChange = (modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    if (model) {
      onValueChange(modelId, model);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">モデル読込中...</span>
      </div>
    );
  }

  const available = models.filter((m) => m.available);
  const locked = models.filter((m) => !m.available);

  return (
    <Select
      value={value}
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="モデルを選択" />
      </SelectTrigger>
      <SelectContent>
        {available.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            <div className="flex items-center gap-2">
              <span>{model.displayName}</span>
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                {model.provider}
              </Badge>
            </div>
          </SelectItem>
        ))}
        {locked.map((model) => (
          <SelectItem key={model.id} value={model.id} disabled>
            <div className="flex items-center gap-2">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">{model.displayName}</span>
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                有料
              </Badge>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
