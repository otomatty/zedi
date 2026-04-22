import React from "react";
import { FileText, FilePlus, Link2, Image } from "lucide-react";
import { cn } from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 * FAB メニューで選択できるオプションの種類。
 * Option type selectable from the FAB menu.
 */
export type FABMenuOption = "blank" | "url" | "image" | "template" | "voice" | "addExisting";

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
        "hover:bg-secondary hover:scale-[1.02] active:scale-[0.98]",
        "focus:ring-ring focus:ring-2 focus:ring-offset-2 focus:outline-none",
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
  /**
   * Options to show in addition to the default create items. Used to expose
   * note-scoped actions (e.g. attach an existing page) only when relevant.
   *
   * 既定の作成項目に追加で表示するオプション。ノート配下でのみ意味を持つ
   * 操作（既存ページの紐付けなど）を必要な時だけ出すために使う。
   */
  extraOptions?: FABMenuOption[];
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
  extraOptions,
}) => {
  const { t } = useTranslation();
  const handleSelect = (option: FABMenuOption) => {
    onSelect(option);
    onOpenChange(false);
  };

  // 先頭に来る項目ほど展開後の位置が下（FAB に近い側）に表示される。
  // Items earlier in the array render closer to the FAB when expanded.
  const extraItems: Array<{
    icon: React.ElementType;
    label: string;
    option: FABMenuOption;
    disabled?: boolean;
  }> = [];

  if (extraOptions?.includes("addExisting")) {
    extraItems.push({
      icon: FilePlus,
      label: t("notes.addExistingPage"),
      option: "addExisting",
    });
  }

  const baseItems: Array<{
    icon: React.ElementType;
    label: string;
    option: FABMenuOption;
    disabled?: boolean;
  }> = [
    { icon: Image, label: t("common.createFromImage"), option: "image" },
    { icon: Link2, label: t("common.createFromUrl"), option: "url" },
    { icon: FileText, label: t("common.createNew"), option: "blank" },
  ];

  const allItems = [...extraItems, ...baseItems];

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
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => onOpenChange(false)}
      />

      {/* FABメニューコンテナ */}
      {/* メニュー非展開時は pointer-events-none で不可視領域がタッチ・スクロールを遮断しないようにする */}
      {/* Disable pointer events on the container when closed so invisible menu area doesn't block touch/scroll */}
      <div
        className={cn(
          "relative z-40 flex flex-col items-end gap-3",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
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

        {/* メインFAB（トリガー）— 常にクリック可能にする */}
        {/* Trigger always receives pointer events so FAB stays clickable */}
        <div className="pointer-events-auto">{trigger}</div>
      </div>
    </>
  );
};

export default FABMenu;
