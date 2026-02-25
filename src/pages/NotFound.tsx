import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

const NotFound = () => {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="animate-fade-in text-center">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-muted">
          <span className="text-4xl font-bold text-muted-foreground">404</span>
        </div>
        <h1 className="mb-2 text-2xl font-bold">{t("errors.notFoundTitle")}</h1>
        <p className="mb-8 text-muted-foreground">{t("errors.notFoundDescription")}</p>
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
