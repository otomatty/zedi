import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@zedi/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@zedi/ui";

interface CollapsibleHelpProps {
  /** Trigger label when closed (e.g. "詳細を見る", "高度な設定") */
  triggerLabel: string;
  /** Trigger label when open (optional; when not provided, same as triggerLabel) */
  triggerLabelOpen?: string;
  children: React.ReactNode;
  /** Default open state */
  defaultOpen?: boolean;
}

/**
 *
 */
export /**
 *
 */
const CollapsibleHelp: React.FC<CollapsibleHelpProps> = ({
  triggerLabel,
  triggerLabelOpen,
  children,
  defaultOpen = false,
}) => {
  /**
   *
   */
  const [open, setOpen] = useState(defaultOpen);
  /**
   *
   */
  const label = open && triggerLabelOpen != null ? triggerLabelOpen : triggerLabel;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
          )}
          {label}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
        <div className="pt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};
