/**
 * 招待メールの日本語テキスト
 * Japanese locale strings for invitation emails
 */
export const ja = {
  invite: {
    subject: (inviterName: string, noteTitle: string) =>
      `[Zedi] ${inviterName} さんがノート「${noteTitle}」にあなたを招待しました`,
    preview: (inviterName: string, noteTitle: string) =>
      `${inviterName} さんからノート「${noteTitle}」への招待が届いています`,
    heading: "ノートへの招待",
    greeting: (inviterName: string) => `${inviterName} さんがあなたをノートに招待しました。`,
    noteLabel: "ノート",
    roleLabel: "権限",
    roles: {
      viewer: "閲覧者",
      editor: "編集者",
    } as Record<string, string>,
    ctaButton: "ノートを開く",
    expiresNotice: "このリンクは 7 日間有効です。",
    footer: "このメールに心当たりがない場合は無視してください。",
    unsubscribe: "Zedi からのメール通知",
  },
} as const;
