import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import Container from "@/components/layout/Container";
import { useTranslation } from "react-i18next";

const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Container className="flex h-16 items-center gap-4">
          <Link to="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">
            {t("settings.general.title")}
          </h1>
        </Container>
      </header>

      {/* Content */}
      <main className="py-6">
        <Container>
          <div className="max-w-2xl mx-auto">
            <GeneralSettingsForm />
          </div>
        </Container>
      </main>
    </div>
  );
};

export default GeneralSettings;
