import React from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, Home, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignedIn } from "@/hooks/useAuth";

export const AppsMenu: React.FC = () => {
  const navigate = useNavigate();

  return (
    <SignedIn>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <LayoutGrid className="h-5 w-5" />
            <span className="sr-only">アプリメニュー</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-64 p-3"
        >
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => navigate("/home")}
              className="flex flex-col items-center gap-2 rounded-lg p-3 hover:bg-muted transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Home className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-medium">ホーム</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/notes")}
              className="flex flex-col items-center gap-2 rounded-lg p-3 hover:bg-muted transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-medium">ノート</span>
            </button>
            {/* 今後: 拡張機能やその他のアプリをここに追加 */}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </SignedIn>
  );
};
