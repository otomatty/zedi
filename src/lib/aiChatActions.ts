import { ChatAction } from '../types/aiChat';

/** AI応答テキストからアクションカードを抽出 */
export function parseActions(content: string): ChatAction[] {
  const regex = /<!-- zedi-action:(\w[\w-]*) -->\n([\s\S]*?)\n<!-- \/zedi-action -->/g;
  const actions: ChatAction[] = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    try {
      const action = JSON.parse(match[2]) as ChatAction;
      actions.push(action);
    } catch (e) {
      console.warn("Failed to parse action:", match[2]);
    }
  }

  return actions;
}

/** アクションカードのコンテンツを除いた表示用テキスト */
export function getDisplayContent(content: string): string {
  return content.replace(
    /<!-- zedi-action:[\w-]+ -->[\s\S]*?<!-- \/zedi-action -->/g,
    ""
  ).trim();
}
