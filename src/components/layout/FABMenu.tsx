import React from "react";
import { FileText, Link2, Image } from "lucide-react";
import { cn } from "@/lib/utils";

export type FABMenuOption =
  | "blank"
  | "url"
  | "image"
  | "template"
  | "voice";

interface FABMenuItemProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  index: number;
  isOpen: boolean;
}

const FABMenuItem: React.FC<FABMenuItemProps> = ({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  index,
  isOpen,
}) => {
  // 展開アニメーションの遅延（下から順に表示）
  const delay = index * 50;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3 px-5 py-3",
        "rounded-full",
        "bg-secondary/80 text-secondary-foreground",
        "shadow-lg hover:shadow-xl",
        "backdrop-blur-sm",
        "transition-all duration-200 ease-out",
        "hover:bg-secondary hover:scale-[1.02] active:scale-[0.98]",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        isOpen
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0",
        disabled && "cursor-not-allowed opacity-50 hover:scale-100"
      )}
      style={{
        transitionDelay: isOpen ? `${delay}ms` : "0ms",
      }}
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
};

interface FABMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (option: FABMenuOption) => void;
  trigger: React.ReactNode;
}

export const FABMenu: React.FC<FABMenuProps> = ({
  open,
  onOpenChange,
  onSelect,
  trigger,
}) => {
  const handleSelect = (option: FABMenuOption) => {
    onSelect(option);
    onOpenChange(false);
  };

  const menuItems: Array<{
    icon: React.ElementType;
    label: string;
    option: FABMenuOption;
    disabled?: boolean;
  }> = [
    { icon: Image, label: "画像から作成", option: "image" },
    { icon: Link2, label: "URLから作成", option: "url" },
    { icon: FileText, label: "新規作成", option: "blank" },
  ];

  return (
    <>
      {/* オーバーレイ（メニュー展開時） */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/20",
          "transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => onOpenChange(false)}
      />

      {/* FABメニューコンテナ */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        {/* メニューアイテム（上方向に展開） */}
        <div className="mb-2 flex flex-col items-end gap-3">
          {menuItems.map((item, index) => (
            <FABMenuItem
              key={item.option}
              icon={item.icon}
              label={item.label}
              onClick={() => handleSelect(item.option)}
              disabled={item.disabled}
              index={index}
              isOpen={open}
            />
          ))}
        </div>

        {/* メインFAB（トリガー） */}
        {trigger}
      </div>
    </>
  );
};

export default FABMenu;
