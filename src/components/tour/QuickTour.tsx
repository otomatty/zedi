import React, { useMemo } from "react";
import { ACTIONS, EVENTS, STATUS, Joyride, Step, EventData } from "react-joyride";
import { useTranslation } from "react-i18next";

/**
 * Props for the home quick tour (react-joyride v3).
 * ホームのクイックツアー（react-joyride v3）の props。
 */
export interface QuickTourProps {
  run: boolean;
  onComplete: () => void;
}

const STEP_TARGETS: (string | undefined)[] = [
  '[data-tour-id="tour-home-page-grid"]',
  '[data-tour-id="tour-apps-menu"]',
  "body",
  '[data-tour-id="tour-fab"]',
  "body",
  "body",
];

/**
 * Guided tour for first-time home navigation using Joyride v3 (`onEvent` API).
 * Joyride v3 の `onEvent` を使った初回ホーム案内ツアー。
 */
export const QuickTour: React.FC<QuickTourProps> = ({ run, onComplete }) => {
  const { t } = useTranslation();

  const steps: Step[] = useMemo(() => {
    const stepKeys = ["step1", "step2", "step3", "step4", "step5", "step6"] as const;
    return stepKeys.map((key, i) => ({
      target: STEP_TARGETS[i],
      title: t(`tour.${key}.title`),
      content: t(`tour.${key}.content`),
      placement: STEP_TARGETS[i] === "body" ? ("center" as const) : ("bottom" as const),
      skipBeacon: true,
    }));
  }, [t]);

  const handleEvent = (data: EventData) => {
    const { status, type, action } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      onComplete();
      return;
    }

    if (type === EVENTS.STEP_AFTER && action === ACTIONS.CLOSE) {
      onComplete();
    }
  };

  const locale = useMemo(
    () => ({
      back: t("tour.buttons.back"),
      close: t("tour.buttons.skip"),
      last: t("tour.buttons.complete"),
      next: t("tour.buttons.next"),
      skip: t("tour.buttons.skip"),
    }),
    [t],
  );

  if (!run) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      onEvent={handleEvent}
      locale={locale}
      scrollToFirstStep
      options={{
        showProgress: true,
        primaryColor: "hsl(var(--primary))",
        zIndex: 10000,
        arrowColor: "hsl(var(--card))",
        backgroundColor: "hsl(var(--card))",
        overlayColor: "rgba(0, 0, 0, 0.5)",
        textColor: "hsl(var(--card-foreground))",
        buttons: ["back", "close", "primary", "skip"],
      }}
      styles={{
        tooltip: {
          borderRadius: "var(--radius)",
          padding: 16,
        },
        tooltipContainer: {
          textAlign: "left",
        },
      }}
    />
  );
};

export default QuickTour;
