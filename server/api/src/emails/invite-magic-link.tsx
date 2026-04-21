/**
 * 招待メール mismatch 救済用のマジックリンクメールテンプレート
 * Magic-link rescue email template for invite email mismatch flow
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
export interface InviteMagicLinkEmailProps {
  /** 招待先メール / Invited email address */
  memberEmail: string;
  /** マジックリンク URL / Magic-link URL */
  magicLinkUrl: string;
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
 * 招待救済用マジックリンクメール React Email コンポーネント
 * Invitation rescue magic-link React Email component
 */
export function InviteMagicLinkEmail({
  memberEmail,
  magicLinkUrl,
  locale = "ja",
}: InviteMagicLinkEmailProps) {
  const t = getLocale(locale).inviteMagicLink;

  return (
    <Html>
      <Head />
      <Preview>{t.preview()}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ padding: "0 32px" }}>
            <Heading style={heading}>{t.heading}</Heading>

            <Text style={paragraph}>{t.greeting}</Text>

            <Text style={metaRow}>
              <span style={metaLabel}>{t.toLabel}: </span>
              {memberEmail}
            </Text>

            <Section style={{ textAlign: "center" as const, margin: "28px 0" }}>
              <Button style={buttonStyle} href={magicLinkUrl}>
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
 * マジックリンクメールを HTML 文字列にレンダリングする
 * Render the magic-link email to an HTML string
 */
export async function renderInviteMagicLinkEmail(
  props: InviteMagicLinkEmailProps,
): Promise<string> {
  return render(<InviteMagicLinkEmail {...props} />);
}

/**
 * マジックリンクメールの件名を取得する
 * Get the magic-link email subject line
 */
export function getInviteMagicLinkSubject(
  props: Pick<InviteMagicLinkEmailProps, "locale">,
): string {
  const t = getLocale(props.locale ?? "ja").inviteMagicLink;
  return t.subject();
}
