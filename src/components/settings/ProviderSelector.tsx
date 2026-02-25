import React from "react";
import { AI_PROVIDERS, AIProviderType } from "@/types/ai";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface ProviderSelectorProps {
  value: AIProviderType;
  onChange: (value: AIProviderType) => void;
  disabled?: boolean;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">プロバイダー</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as AIProviderType)}
        className="grid grid-cols-1 gap-3"
        disabled={disabled}
      >
        {AI_PROVIDERS.map((provider) => {
          const isSelected = value === provider.id;

          return (
            <div
              key={provider.id}
              className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
            >
              <RadioGroupItem
                value={provider.id}
                id={`provider-${provider.id}`}
                disabled={disabled}
                className="mt-1"
              />
              <div className="flex-1">
                <Label
                  htmlFor={`provider-${provider.id}`}
                  className="flex cursor-pointer items-center gap-2 font-medium"
                >
                  {provider.name}
                </Label>
                {provider.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{provider.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
};
