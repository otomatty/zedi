import { Link } from "react-router-dom";
import { AlertTriangle, Home, RotateCw } from "lucide-react";
import { Button } from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 * ErrorScreen の props。
 * Props for ErrorScreen.
 */
export interface ErrorScreenProps {
  /** ErrorBoundary が捕捉した例外 / The error captured by ErrorBoundary */
  error: Error;
}

/**
 * 予期せぬエラー発生時に ErrorBoundary のフォールバックとして表示する全画面。
 * NotFound と同じレイアウトトーンを採り、再読み込みとホームへの導線を提供する。
 *
 * Full-page fallback rendered by ErrorBoundary when an unexpected error is
 * caught. Mirrors the NotFound layout and offers reload / home actions.
 *
 * @see https://github.com/otomatty/zedi/issues/906 - follow-up: surface Sentry eventId
 */
const ErrorScreen = ({ error }: ErrorScreenProps) => {
  const { t } = useTranslation();

  const handleReload = (): void => {
    window.location.reload();
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="bg-background flex min-h-screen items-center justify-center px-4"
    >
      <div className="animate-fade-in w-full max-w-md text-center">
        <div className="bg-muted mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full">
          <AlertTriangle className="text-muted-foreground h-10 w-10" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-2xl font-bold">{t("errors.unexpectedTitle")}</h1>
        <p className="text-muted-foreground mb-6">{t("errors.unexpectedDescription")}</p>

        <details
          className="text-muted-foreground mb-8 text-left text-xs"
          open={import.meta.env.DEV}
        >
          <summary className="cursor-pointer select-none">{t("errors.unexpectedDetails")}</summary>
          <pre className="bg-muted mt-2 max-h-40 overflow-auto rounded p-3 break-words whitespace-pre-wrap">
            {error.message}
          </pre>
        </details>

        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button onClick={handleReload} className="gap-2">
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            {t("errors.actionReload")}
          </Button>
          <Button asChild variant="outline">
            <Link to="/" className="gap-2">
              <Home className="h-4 w-4" aria-hidden="true" />
              {t("errors.actionBackToHome")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ErrorScreen;
