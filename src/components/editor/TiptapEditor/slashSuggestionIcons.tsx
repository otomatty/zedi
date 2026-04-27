/**
 * Lucide icon map for slash menu (blocks + agent commands).
 * スラッシュメニュー用の Lucide アイコンマップ。
 */

import type { FC, SVGProps } from "react";
import {
  Pilcrow,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code2,
  Minus,
  Table,
  ImagePlus,
  Camera,
  GitBranch,
  Sigma,
  Radical,
  Terminal,
  Bot,
  FileSearch,
  Search,
  ListChecks,
  FlaskConical,
  HelpCircle,
  AlignLeft,
} from "lucide-react";
import type { AgentSlashCommandId } from "@/lib/agentSlashCommands/types";

/** Map icon name string → Lucide component / アイコン名 → Lucide コンポーネント */
export const slashMenuIconMap: Record<string, FC<SVGProps<SVGSVGElement>>> = {
  Pilcrow,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code2,
  Minus,
  Table,
  ImagePlus,
  Camera,
  GitBranch,
  Sigma,
  Radical,
  Terminal,
  Bot,
  FileSearch,
  Search,
  ListChecks,
  FlaskConical,
  HelpCircle,
  AlignLeft,
};

/** Agent row icon names (keys into {@link slashMenuIconMap}). / エージェント行のアイコン名 */
export const agentSlashIconName: Record<AgentSlashCommandId, string> = {
  "agent-analyze": "FileSearch",
  "agent-git-summary": "GitBranch",
  "agent-run": "Terminal",
  "agent-research": "Search",
  "agent-review": "ListChecks",
  "agent-test": "FlaskConical",
  "agent-explain": "HelpCircle",
  "agent-summarize": "AlignLeft",
};
