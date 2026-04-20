import React from "react";
import { useTranslation } from "react-i18next";

const FAQ_ITEMS = [
  "whatAreCostUnits",
  "usageCalculation",
  "budgetExceeded",
  "apiKeyDifference",
  "refundPolicy",
] as const;

/**
 * FAQ section shown at the bottom of `/pricing`.
 * / `/pricing` ページ下部の FAQ セクション。
 */
export const PricingFaq: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto mt-12 max-w-3xl">
      <h3 className="mb-4 text-center text-lg font-semibold">{t("pricing.faq.title")}</h3>
      <div className="space-y-4">
        {FAQ_ITEMS.map((key) => (
          <div key={key} className="rounded-lg border p-4">
            <h4 className="mb-1 font-medium">{t(`pricing.faq.${key}.question`)}</h4>
            <p className="text-muted-foreground text-sm">{t(`pricing.faq.${key}.answer`)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PricingFaq;
