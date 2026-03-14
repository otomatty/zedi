import React from "react";
import { FileText, Link2, Image } from "lucide-react";
import { cn } from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 * FAB メニューで選択できるオプションの種類。
 * Option type selectable from the FAB menu.
 */
export type FABMenuOption = "blank" | "url" | "image" | "template" | "voice";

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
        "flex items-center gap-4 px-6 py-4",
        "rounded-full",
        "bg-secondary/80 text-secondary-foreground",
        "shadow-lg hover:shadow-xl",
        "backdrop-blur-sm",
        "transition-all duration-200 ease-out",
        "hover:scale-[1.02] hover:bg-secondary active:scale-[0.98]",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        isOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        disabled && "cursor-not-allowed opacity-50 hover:scale-100",
      )}
      style={{
        transitionDelay: isOpen ? `${delay}ms` : "0ms",
      }}
    >
      <Icon className="h-6 w-6" />
      <span className="text-base font-medium">{label}</span>
    </button>
  );
};

interface FABMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (option: FABMenuOption) => void;
  trigger: React.ReactNode;
  /** Options to hide from the menu (e.g. auth-gated features for guests) */
  hiddenOptions?: FABMenuOption[];
}

/**
 * Floating Action Button の展開メニュー。画像・URL・新規・テンプレートなどの作成オプションを表示する。
 * FAB expansion menu showing create options (image, URL, blank, template, etc.).
 *
 * @param open - メニューの開閉状態 / Menu open state
 * @param onOpenChange - 開閉状態の変更ハンドラ / Handler for open state change
 * @param onSelect - オプション選択時のハンドラ / Handler when option is selected
 * @param trigger - メニューを開くトリガー要素 / Trigger element to open menu
 * @param hiddenOptions - 非表示にするオプション（例: ゲスト向け認証制限） / Options to hide (e.g. auth-gated for guests)
 */
export const FABMenu: React.FC<FABMenuProps> = ({
  open,
  onOpenChange,
  onSelect,
  trigger,
  hiddenOptions,
}) => {
  const { t } = useTranslation();
  const handleSelect = (option: FABMenuOption) => {
    onSelect(option);
    onOpenChange(false);
  };

  const allItems: Array<{
    icon: React.ElementType;
    label: string;
    option: FABMenuOption;
    disabled?: boolean;
  }> = [
    { icon: Image, label: t("common.createFromImage"), option: "image" },
    { icon: Link2, label: t("common.createFromUrl"), option: "url" },
    { icon: FileText, label: t("common.createNew"), option: "blank" },
  ];

  const menuItems = hiddenOptions
    ? allItems.filter((item) => !hiddenOptions.includes(item.option))
    : allItems;

  return (
    <>
      {/* オーバーレイ（メニュー展開時） */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/35",
          "transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => onOpenChange(false)}
      />

      {/* FABメニューコンテナ */}
      <div className="relative z-40 flex flex-col items-end gap-3">
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
