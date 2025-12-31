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
        className="flex flex-wrap gap-4"
        disabled={disabled}
      >
        {AI_PROVIDERS.map((provider) => (
          <div key={provider.id} className="flex items-center space-x-2">
            <RadioGroupItem
              value={provider.id}
              id={`provider-${provider.id}`}
              disabled={disabled}
            />
            <Label
              htmlFor={`provider-${provider.id}`}
              className="cursor-pointer font-normal"
            >
              {provider.name}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
};
