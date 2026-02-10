import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, addMonths, subMonths, startOfMonth } from "date-fns";
import { ja } from "date-fns/locale";

export const MonthNavigation: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date())
  );

  const monthLabel = useMemo(
    () => format(currentMonth, "yyyy年M月", { locale: ja }),
    [currentMonth]
  );

  return (
    <div className="hidden sm:flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setCurrentMonth((prev) => subMonths(prev, 1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium text-muted-foreground min-w-[100px] text-center">
        {monthLabel}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};
