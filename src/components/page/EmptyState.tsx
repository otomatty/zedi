import React from "react";
import { Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateNewPage } from "@/hooks/useCreateNewPage";

const EmptyState: React.FC = () => {
  const { createNewPage, isCreating } = useCreateNewPage();

  return (
    <div className="flex animate-fade-in flex-col items-center justify-center px-4 py-24 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
        <Sparkles className="h-10 w-10 text-primary" />
      </div>

      <h2 className="mb-2 text-xl font-semibold">Zediへようこそ</h2>

      <p className="mb-8 max-w-md leading-relaxed text-muted-foreground">
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
