import React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCreateNewPage } from "@/hooks/useCreateNewPage";

const FloatingActionButton: React.FC = () => {
  const { createNewPage, isCreating } = useCreateNewPage();

  return (
    <Button
      onClick={createNewPage}
      disabled={isCreating}
      size="icon"
      className={cn(
        "fixed bottom-6 right-6 h-14 w-14 rounded-full",
        "shadow-elevated hover:shadow-glow",
        "transition-all duration-300",
        "z-40"
      )}
    >
      <Plus className="h-6 w-6" />
    </Button>
  );
};

export default FloatingActionButton;
