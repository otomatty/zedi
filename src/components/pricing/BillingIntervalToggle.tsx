import React from "react";
import { useTranslation } from "react-i18next";
import { Button, cn } from "@zedi/ui";
import type { BillingInterval } from "@/lib/subscriptionService";

/**
 *
 */
export interface BillingIntervalToggleProps {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
  className?: string;
}

/**
 * Monthly/Yearly toggle used above the Pro plan comparison card.
 * / Pro プランの比較カード上部に置く月額・年額切替トグル。
 */
export const BillingIntervalToggle: React.FC<BillingIntervalToggleProps> = ({
  value,
  onChange,
  className,
}) => {
  const { t } = useTranslation();
  return (
    <div className={cn("flex justify-center gap-2", className)}>
      <Button
        variant={value === "monthly" ? "default" : "outline"}
        size="sm"
        onClick={() => onChange("monthly")}
      >
        {t("pricing.billingMonthly")}
      </Button>
      <Button
        variant={value === "yearly" ? "default" : "outline"}
        size="sm"
        onClick={() => onChange("yearly")}
      >
        {t("pricing.billingYearly")}
      </Button>
    </div>
  );
};

export default BillingIntervalToggle;
