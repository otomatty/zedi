/**
 * `PhaseStepper` — top-of-panel progress indicator for Wiki Compose (#950).
 *
 * Brief → Research → Structure → Draft → Completed の 5 段階を、現在のフェーズに
 * 応じて active / completed / upcoming で色分け表示する。Compose 画面の右ペイン
 * ヘッダーに常時表示し、ユーザーが現在地を見失わないようにする。
 *
 * Compact, non-interactive stepper. The user advances phases by submitting at
 * each interrupt; this component reflects the resulting phase, it does not
 * trigger transitions.
 */
import React from "react";
import { Check, Circle, CircleDashed } from "lucide-react";
import { cn } from "@zedi/ui";
import type { ComposePhase } from "@/hooks/useWikiComposeSession";

const PHASE_ORDER: ComposePhase[] = ["brief", "research", "structure", "draft", "completed"];

const PHASE_LABEL: Record<ComposePhase, string> = {
  brief: "Brief",
  research: "Research",
  structure: "Structure",
  draft: "Draft",
  completed: "Done",
};

export interface PhaseStepperProps {
  /** Current phase. */
  phase: ComposePhase;
}

/** Render the 5-step phase stepper. */
export const PhaseStepper: React.FC<PhaseStepperProps> = ({ phase }) => {
  // P5 conflict interrupt sits between Research and Structure on the graph, but
  // the stepper keeps five labels — highlight Research while resolving conflicts.
  const stepPhase: ComposePhase = phase === "conflict" ? "research" : phase;
  const currentIndex = Math.max(0, PHASE_ORDER.indexOf(stepPhase));
  return (
    <ol className="flex items-center gap-1 text-xs" aria-label="Compose phase progress">
      {PHASE_ORDER.map((p, i) => {
        const state = i < currentIndex ? "completed" : i === currentIndex ? "active" : "upcoming";
        return (
          <React.Fragment key={p}>
            <li
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1",
                state === "completed" && "text-emerald-600 dark:text-emerald-400",
                state === "active" && "text-foreground bg-muted font-medium",
                state === "upcoming" && "text-muted-foreground",
              )}
              data-testid={`phase-step-${p}`}
              aria-current={state === "active" ? "step" : undefined}
            >
              {state === "completed" ? (
                <Check className="h-3 w-3" aria-hidden />
              ) : state === "active" ? (
                <Circle className="h-3 w-3 fill-current" aria-hidden />
              ) : (
                <CircleDashed className="h-3 w-3" aria-hidden />
              )}
              <span>{PHASE_LABEL[p]}</span>
            </li>
            {i < PHASE_ORDER.length - 1 ? <li aria-hidden className="bg-border h-px w-3" /> : null}
          </React.Fragment>
        );
      })}
    </ol>
  );
};
