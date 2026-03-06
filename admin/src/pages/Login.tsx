/**
 * 管理者ログイン案内
 * メインアプリでサインイン後、このドメインに戻るとセッションが有効になる。
 */
export default function Login() {
  const mainAppUrl = import.meta.env.VITE_MAIN_APP_URL ?? "https://zedi-note.app";
  const signInUrl = `${mainAppUrl}/sign-in?redirect=${encodeURIComponent(window.location.origin)}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
      <div className="text-center max-w-sm">
        <h1 className="text-xl font-semibold">Zedi 管理画面</h1>
        <p className="mt-4 text-slate-400 text-sm">
          管理者としてログインするには、まずメインアプリでサインインしてください。
        </p>
        <a
          href={signInUrl}
          className="mt-6 inline-block rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
        >
          サインインして続ける
        </a>
        <p className="mt-4 text-slate-500 text-xs">
          サインイン後、このページに戻ってきてください。
        </p>
      </div>
    </div>
  );
}
