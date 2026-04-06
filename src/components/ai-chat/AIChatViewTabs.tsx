import { useTranslation } from "react-i18next";
import { MessageSquare, GitBranch, ListChecks } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@zedi/ui";

/**
 * Active AI chat panel view: threaded messages or branch tree.
 * AI チャットパネルの表示：スレッド表示かブランチツリーか。
 */
export type AIChatViewTab = "chat" | "branch" | "workflow";

/**
 * Props for {@link AIChatViewTabs}.
 * {@link AIChatViewTabs} 向けプロパティ。
 */
interface AIChatViewTabsProps {
  /** Currently selected tab. / 選択中のタブ */
  activeTab: AIChatViewTab;
  /** Called when the user selects a tab. / ユーザーがタブを選んだとき */
  onTabChange: (tab: AIChatViewTab) => void;
}

/**
 * Segment control to switch between chat view and branch tree view.
 * チャットビューとブランチツリービューの切り替え用セグメントコントロール。
 */
export function AIChatViewTabs({ activeTab, onTabChange }: AIChatViewTabsProps) {
  const { t } = useTranslation();

  return (
    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as AIChatViewTab)}>
      <TabsList className="h-8 rounded-lg p-0.5">
        <TabsTrigger
          value="chat"
          className="flex h-7 items-center gap-1.5 px-3 text-xs data-[state=active]:shadow-sm"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {t("aiChat.viewTabs.chat")}
        </TabsTrigger>
        <TabsTrigger
          value="branch"
          className="flex h-7 items-center gap-1.5 px-3 text-xs data-[state=active]:shadow-sm"
        >
          <GitBranch className="h-3.5 w-3.5" />
          {t("aiChat.viewTabs.branch")}
        </TabsTrigger>
        <TabsTrigger
          value="workflow"
          className="flex h-7 items-center gap-1.5 px-3 text-xs data-[state=active]:shadow-sm"
        >
          <ListChecks className="h-3.5 w-3.5" />
          {t("aiChat.viewTabs.workflow")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
