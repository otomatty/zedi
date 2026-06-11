import * as React from "react";
import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "../lib/utils";

type ResizablePanelGroupProps = Omit<React.ComponentProps<typeof Group>, "orientation"> & {
  direction?: "horizontal" | "vertical";
};

/**
 *
 */
const ResizablePanelGroup = ({
  className,
  direction = "horizontal",
  ...props
}: ResizablePanelGroupProps) => (
  <Group {...props} orientation={direction} className={cn("flex h-full w-full", className)} />
);

const ResizablePanel = Panel;

type ResizableHandleProps = React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
};

/**
 *
 */
const ResizableHandle = ({ withHandle, className, ...props }: ResizableHandleProps) => (
  <Separator
    className={cn(
      // react-resizable-panels v4 は ARIA 規約どおり「separator 自身の見た目の向き」を
      // aria-orientation に設定する: 左右分割 → vertical（細い縦線・基底クラス）、
      // 上下分割 → horizontal（全幅の横線・バリアントで上書き）。
      // v4 sets aria-orientation to the separator's own visual orientation:
      // a left/right split yields `vertical` (thin line, base classes) and a
      // stacked split yields `horizontal` (full-width line, variant below).
      "bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-none aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-sm border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
