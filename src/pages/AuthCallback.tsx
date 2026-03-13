/**
 * OAuth callback page.
 * Better Auth handles the code exchange server-side; this page simply waits
 * for the session to become available and then redirects to /home.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/lib/auth/authClient";

export default function AuthCallback() {
  const { t } = useTranslation();
  const { data: session, isPending } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    const errorDescription = params.get("error_description");

    if (errorParam) {
      queueMicrotask(() => setError(errorDescription || errorParam));
      return;
    }

    if (!isPending && session) {
      window.location.assign("/home");
    }
  }, [session, isPending]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <p className="mb-4 text-destructive">{error}</p>
        <a href="/sign-in" className="text-primary hover:underline">
          {t("auth.backToSignIn")}
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <p className="text-muted-foreground">{t("auth.signingIn")}</p>
    </div>
  );
}
