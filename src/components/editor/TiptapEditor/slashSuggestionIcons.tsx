/**
 * Lucide icon map for slash menu blocks.
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
} from "lucide-react";

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
};
