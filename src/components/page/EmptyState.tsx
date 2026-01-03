import React from "react";
import { Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateNewPage } from "@/hooks/useCreateNewPage";

const EmptyState: React.FC = () => {
  const { createNewPage, isCreating } = useCreateNewPage();

  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6">
        <Sparkles className="h-10 w-10 text-primary" />
      </div>

      <h2 className="text-xl font-semibold mb-2">Zediへようこそ</h2>

      <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
        思考のネットワークを構築しましょう。
        <br />
        最初のページを作成して、アイデアを記録し始めてください。
      </p>

      <Button
        onClick={createNewPage}
        disabled={isCreating}
        size="lg"
        className="gap-2 shadow-glow"
      >
        <Plus className="h-5 w-5" />
        最初のページを作成
      </Button>
    </div>
  );
};

export default EmptyState;
