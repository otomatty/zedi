import { Button } from "@zedi/ui";

/**
 * 管理者ログイン案内
 * メインアプリでサインイン後、このドメインに戻るとセッションが有効になる。
 */
export default function Login() {
  const mainAppUrl = import.meta.env.VITE_MAIN_APP_URL || "https://zedi-note.app";
  const signInUrl = `${mainAppUrl}/sign-in`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-100">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">Zedi 管理画面</h1>
        <p className="mt-4 text-sm text-slate-400">
          管理者としてログインするには、まずメインアプリでサインインしてください。
        </p>
        <Button asChild size="lg" className="mt-6">
          <a href={signInUrl}>サインインして続ける</a>
        </Button>
        <p className="mt-4 text-xs text-slate-500">
          サインイン後、このページに戻ってきてください。
        </p>
      </div>
    </div>
  );
}
