import React from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Zap } from "lucide-react";

/**
 * AI feature comparison block shown on `/pricing`.
 * Free / Pro のAI機能比較ブロック。
 */
export const PricingAiInfo: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto mt-12 max-w-3xl">
      <h3 className="mb-4 text-center text-lg font-semibold">{t("pricing.aiInfo.title")}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h4 className="mb-2 flex items-center gap-2 font-medium">
            <Sparkles className="text-primary h-4 w-4" />
            {t("pricing.aiInfo.freeTitle")}
          </h4>
          <ul className="text-muted-foreground space-y-1 text-sm">
            <li>- {t("pricing.aiInfo.freeFeatures.models")}</li>
            <li>- {t("pricing.aiInfo.freeFeatures.limit")}</li>
            <li>- {t("pricing.aiInfo.freeFeatures.features")}</li>
          </ul>
        </div>
        <div className="border-primary/20 bg-primary/5 rounded-lg border p-4">
          <h4 className="mb-2 flex items-center gap-2 font-medium">
            <Zap className="text-primary h-4 w-4" />
            {t("pricing.aiInfo.proTitle")}
          </h4>
          <ul className="text-muted-foreground space-y-1 text-sm">
            <li>- {t("pricing.aiInfo.proFeatures.models")}</li>
            <li>- {t("pricing.aiInfo.proFeatures.limit")}</li>
            <li>- {t("pricing.aiInfo.proFeatures.features")}</li>
          </ul>
        </div>
      </div>
      <p className="text-muted-foreground mt-4 text-center text-xs">
        {t("pricing.aiInfo.ownApiKeyNote")}
      </p>
    </div>
  );
};

export default PricingAiInfo;
