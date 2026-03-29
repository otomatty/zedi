import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home } from "lucide-react";
import { Button } from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 *
 */
const NotFound = () => {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="animate-fade-in text-center">
        <div className="bg-muted mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full">
          <span className="text-muted-foreground text-4xl font-bold">404</span>
        </div>
        <h1 className="mb-2 text-2xl font-bold">{t("errors.notFoundTitle")}</h1>
        <p className="text-muted-foreground mb-8">{t("errors.notFoundDescription")}</p>
        <Button asChild>
          <Link to="/" className="gap-2">
            <Home className="h-4 w-4" />
            {t("errors.backToHome")}
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
