/**
 * ノート招待メールテンプレート
 * Note invitation email template
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  render,
} from "@react-email/components";
import type { Locale } from "./locales/index.js";
import { getLocale } from "./locales/index.js";

/**
 * テンプレートの Props
 * Template props
 */
export interface InviteNoteEmailProps {
  /** ノートタイトル / Note title */
  noteTitle: string;
  /** 招待者名 / Inviter's display name */
  inviterName: string;
  /** 付与されるロール / Assigned role */
  role: string;
  /** 招待リンク URL / Invitation link URL */
  inviteUrl: string;
  /** ロケール / Locale */
  locale?: Locale;
}

/** ブランドカラー / Brand colour */
const BRAND_COLOR = "#2563eb";

const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "560px",
  borderRadius: "8px",
};

const heading: React.CSSProperties = {
  fontSize: "24px",
  letterSpacing: "-0.5px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#1a1a1a",
  padding: "17px 0 0",
  textAlign: "center" as const,
};

const paragraph: React.CSSProperties = {
  margin: "0 0 15px",
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#3c4149",
};

const metaRow: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: "14px",
  lineHeight: "1.6",
  color: "#3c4149",
};

const metaLabel: React.CSSProperties = {
  fontWeight: "600",
  color: "#1a1a1a",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: BRAND_COLOR,
  borderRadius: "6px",
  color: "#fff",
  fontSize: "15px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
};

const hr: React.CSSProperties = {
  borderColor: "#dfe1e4",
  margin: "26px 0",
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "1.5",
  color: "#898989",
};

/**
 * ノート招待メール React Email コンポーネント
 * Note invitation email React Email component
 */
export function InviteNoteEmail({
  noteTitle,
  inviterName,
  role,
  inviteUrl,
  locale = "ja",
}: InviteNoteEmailProps) {
  const t = getLocale(locale).invite;
  const roleName = t.roles[role] ?? role;

  return (
    <Html>
      <Head />
      <Preview>{t.preview(inviterName, noteTitle)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ padding: "0 32px" }}>
            <Heading style={heading}>{t.heading}</Heading>

            <Text style={paragraph}>{t.greeting(inviterName)}</Text>

            <Text style={metaRow}>
              <span style={metaLabel}>{t.noteLabel}: </span>
              {noteTitle}
            </Text>
            <Text style={metaRow}>
              <span style={metaLabel}>{t.roleLabel}: </span>
              {roleName}
            </Text>

            <Section style={{ textAlign: "center" as const, margin: "28px 0" }}>
              <Button style={buttonStyle} href={inviteUrl}>
                {t.ctaButton}
              </Button>
            </Section>

            <Text style={paragraph}>{t.expiresNotice}</Text>

            <Hr style={hr} />

            <Text style={footer}>{t.footer}</Text>
            <Text style={footer}>{t.unsubscribe}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * テンプレートを HTML 文字列にレンダリングする
 * Render the template to an HTML string
 *
 * @param props - テンプレート Props / Template props
 * @returns HTML 文字列 / HTML string
 */
export async function renderInviteNoteEmail(props: InviteNoteEmailProps): Promise<string> {
  return render(<InviteNoteEmail {...props} />);
}

/**
 * 招待メールの件名を取得する
 * Get the invitation email subject line
 *
 * @param props - テンプレート Props（inviterName, noteTitle, locale）/ Template props
 * @returns 件名文字列 / Subject string
 */
export function getInviteNoteSubject(
  props: Pick<InviteNoteEmailProps, "inviterName" | "noteTitle" | "locale">,
): string {
  const t = getLocale(props.locale ?? "ja").invite;
  return t.subject(props.inviterName, props.noteTitle);
}
