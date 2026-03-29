import React from "react";
import { Sparkles, Plus } from "lucide-react";
import { Button } from "@zedi/ui";
import { useCreateNewPage } from "@/hooks/useCreateNewPage";

/**
 *
 */
const EmptyState: React.FC = () => {
  const { createNewPage, isCreating } = useCreateNewPage();

  return (
    <div className="animate-fade-in flex flex-col items-center justify-center px-4 py-24 text-center">
      <div className="from-primary/20 to-primary/5 mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br">
        <Sparkles className="text-primary h-10 w-10" />
      </div>

      <h2 className="mb-2 text-xl font-semibold">Zediへようこそ</h2>

      <p className="text-muted-foreground mb-8 max-w-md leading-relaxed">
        思考のネットワークを構築しましょう。
        <br />
        最初のページを作成して、アイデアを記録し始めてください。
      </p>

      <Button onClick={createNewPage} disabled={isCreating} size="lg" className="shadow-glow gap-2">
        <Plus className="h-5 w-5" />
        最初のページを作成
      </Button>
    </div>
  );
};

export default EmptyState;
