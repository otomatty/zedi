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
  inviteMagicLink: {
    subject: () => `[Zedi] 招待を受諾するためのサインインリンク`,
    preview: () => `招待を受諾するためのワンタイムサインインリンクです`,
    heading: "サインインして招待を受諾",
    greeting:
      "下のボタンをクリックすると、招待先のメールアドレスでサインインし、招待受諾ページに戻ります。",
    toLabel: "宛先",
    ctaButton: "サインインして招待を受諾",
    expiresNotice: "このリンクは短時間で失効します。届いたらすぐに開いてください。",
    footer: "このメールに心当たりがない場合は無視してください。",
    unsubscribe: "Zedi からのメール通知",
  },
} as const;
