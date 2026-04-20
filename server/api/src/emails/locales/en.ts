/**
 * Invitation email English locale strings
 * 招待メールの英語テキスト
 */
export const en = {
  invite: {
    subject: (inviterName: string, noteTitle: string) =>
      `[Zedi] ${inviterName} invited you to the note '${noteTitle}'`,
    preview: (inviterName: string, noteTitle: string) =>
      `${inviterName} has invited you to the note '${noteTitle}'`,
    heading: "Note Invitation",
    greeting: (inviterName: string) => `${inviterName} has invited you to collaborate on a note.`,
    noteLabel: "Note",
    roleLabel: "Role",
    roles: {
      viewer: "Viewer",
      editor: "Editor",
    } as Record<string, string>,
    ctaButton: "Open Note",
    expiresNotice: "This link is valid for 7 days.",
    footer: "If you didn't expect this email, you can safely ignore it.",
    unsubscribe: "Email notifications from Zedi",
  },
  inviteMagicLink: {
    subject: () => `[Zedi] Sign-in link to accept your invitation`,
    preview: () => `One-time sign-in link to accept your invitation`,
    heading: "Sign in to accept the invitation",
    greeting:
      "Click the button below to sign in as the invited email address and return to the invitation page.",
    toLabel: "To",
    ctaButton: "Sign in and accept",
    expiresNotice: "This link expires shortly. Please open it as soon as you receive the email.",
    footer: "If you didn't expect this email, you can safely ignore it.",
    unsubscribe: "Email notifications from Zedi",
  },
} as const;
