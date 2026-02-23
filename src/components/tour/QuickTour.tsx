import React, { useMemo } from "react";
import Joyride, { CallBackProps, STATUS, EVENTS, ACTIONS, Step } from "react-joyride";
import { useTranslation } from "react-i18next";

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

export const QuickTour: React.FC<QuickTourProps> = ({ run, onComplete }) => {
  const { t } = useTranslation();

  const steps: Step[] = useMemo(() => {
    const stepKeys = ["step1", "step2", "step3", "step4", "step5", "step6"] as const;
    return stepKeys.map((key, i) => ({
      target: STEP_TARGETS[i],
      title: t(`tour.${key}.title`),
      content: t(`tour.${key}.content`),
      placement: STEP_TARGETS[i] === "body" ? ("center" as const) : ("bottom" as const),
      disableBeacon: true,
    }));
  }, [t]);

  const handleCallback = (data: CallBackProps) => {
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
      showProgress
      showSkipButton
      callback={handleCallback}
      locale={locale}
      scrollToFirstStep
      spotlightClicks={false}
      floaterProps={{
        disableAnimation: false,
      }}
      styles={{
        options: {
          primaryColor: "hsl(var(--primary))",
          zIndex: 10000,
          arrowColor: "hsl(var(--card))",
          backgroundColor: "hsl(var(--card))",
          overlayColor: "rgba(0, 0, 0, 0.5)",
          textColor: "hsl(var(--card-foreground))",
        },
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
