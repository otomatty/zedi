import { Button } from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 * 管理者ログイン案内
 * メインアプリでサインイン後、このドメインに戻るとセッションが有効になる。
 *
 * Admin login prompt. Once the user signs in via the main app, returning to
 * this domain establishes the admin session.
 */
export default function Login() {
  const { t } = useTranslation();
  const mainAppUrl = import.meta.env.VITE_MAIN_APP_URL || "https://zedi-note.app";
  const signInUrl = `${mainAppUrl}/sign-in`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-100">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">{t("auth.title")}</h1>
        <p className="mt-4 text-sm text-slate-400">{t("auth.description")}</p>
        <Button asChild size="lg" className="mt-6">
          <a href={signInUrl}>{t("auth.signInButton")}</a>
        </Button>
        <p className="mt-4 text-xs text-slate-500">{t("auth.afterSignIn")}</p>
      </div>
    </div>
  );
}
