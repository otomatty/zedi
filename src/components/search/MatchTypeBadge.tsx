import { cn } from "@/lib/utils";
import type { MatchType } from "@/lib/searchUtils";

interface MatchTypeBadgeProps {
  type: MatchType;
}

const config: Record<
  MatchType,
  { label: string; className: string }
> = {
  exact_title: {
    label: "完全一致",
    className: "bg-green-100 text-green-800 font-semibold",
  },
  title: {
    label: "タイトル",
    className: "bg-green-50 text-green-700",
  },
  both: {
    label: "タイトル+本文",
    className: "bg-blue-50 text-blue-700",
  },
  content: {
    label: "本文",
    className: "bg-gray-100 text-gray-600",
  },
};

export function MatchTypeBadge({ type }: MatchTypeBadgeProps) {
  const { label, className } = config[type];

  return (
    <span
      className={cn(
        "text-xs px-1.5 py-0.5 rounded shrink-0",
        className
      )}
    >
      {label}
    </span>
  );
}
