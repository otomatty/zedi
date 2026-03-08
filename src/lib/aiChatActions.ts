import { ChatAction } from "../types/aiChat";

/** アクションブロック検出用正規表現（複数行・空白のゆらぎに対応） */
const ACTION_BLOCK_REGEX =
  /<!--\s*zedi-action:(\w[\w-]*)\s*-->\s*([\s\S]*?)\s*<!--\s*\/zedi-action\s*-->/g;

/** AI応答テキストからアクションカードを抽出 */
export function parseActions(content: string): ChatAction[] {
  const actions: ChatAction[] = [];
  let match;
  ACTION_BLOCK_REGEX.lastIndex = 0;

  while ((match = ACTION_BLOCK_REGEX.exec(content)) !== null) {
    try {
      const raw = match[2].trim();
      const action = JSON.parse(raw) as ChatAction;
      actions.push(action);
    } catch {
      console.warn("Failed to parse action:", match[2]);
    }
  }

  return actions;
}

/** アクションカードのコンテンツを除いた表示用テキスト */
export function getDisplayContent(content: string): string {
  return content
    .replace(/<!--\s*zedi-action:[\w-]+\s*-->[\s\S]*?<!--\s*\/zedi-action\s*-->/g, "")
    .trim();
}
