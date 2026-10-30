import { useState } from "hono/jsx/dom";

/**
 * Passwordless sign-in with a Better Auth magic link. In development the link is read
 * from the dev outbox instead of e-mail.
 * Better Auth のマジックリンクでサインインする画面。開発時はメールの代わりに開発用の受信箱から読む。
 */
export function SignInPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [devLink, setDevLink] = useState<string | null>(null);

  const submit = async (event: Event) => {
    event.preventDefault();
    setState("sending");
    try {
      const { authClient } = await import("../authClient");
      const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/notes" });
      if (error) throw new Error(error.message);
      setState("sent");
      const outbox = await fetch(`/api/dev/outbox?email=${encodeURIComponent(email)}`);
      if (outbox.ok) setDevLink(((await outbox.json()) as { url: string }).url);
    } catch {
      setState("error");
    }
  };

  return (
    <main class="sign-in">
      <h1>Zedi にサインイン</h1>
      <form onSubmit={submit}>
        <label>
          メールアドレス
          <input
            type="email"
            required
            autocomplete="email"
            value={email}
            onInput={(e: Event) => setEmail((e.target as HTMLInputElement).value)}
            data-testid="sign-in-email"
          />
        </label>
        <button type="submit" disabled={state === "sending"} data-testid="sign-in-submit">
          ログインリンクを送信
        </button>
      </form>
      {state === "sent" && (
        <p role="status">ログインリンクを送信しました。メールを確認してください。</p>
      )}
      {state === "error" && (
        <p role="alert">送信できませんでした。時間をおいて再度お試しください。</p>
      )}
      {devLink && (
        <p class="dev-link">
          開発環境:{" "}
          <a href={devLink} data-testid="dev-magic-link" rel="external">
            ログインリンクを開く
          </a>
        </p>
      )}
    </main>
  );
}
