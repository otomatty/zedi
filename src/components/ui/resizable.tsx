import * as React from "react";
import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "@/lib/utils";

type ResizablePanelGroupProps = Omit<React.ComponentProps<typeof Group>, "orientation"> & {
  direction?: "horizontal" | "vertical";
};

const ResizablePanelGroup = ({
  className,
  direction = "horizontal",
  ...props
}: ResizablePanelGroupProps) => (
  <Group
    {...props}
    orientation={direction}
    className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
  />
);

const ResizablePanel = Panel;

type ResizableHandleProps = React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
};

const ResizableHandle = ({ withHandle, className, ...props }: ResizableHandleProps) => (
  <Separator
    className={cn(
      "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 aria-[orientation=vertical]:h-px aria-[orientation=vertical]:w-full aria-[orientation=vertical]:after:left-0 aria-[orientation=vertical]:after:h-1 aria-[orientation=vertical]:after:w-full aria-[orientation=vertical]:after:-translate-y-1/2 aria-[orientation=vertical]:after:translate-x-0 [&[aria-orientation=vertical]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
