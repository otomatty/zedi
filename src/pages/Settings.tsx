import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Image as ImageIcon, Settings2 } from "lucide-react";
import { Button } from "@zedi/ui";
import { Card, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
import Container from "@/components/layout/Container";
import { useTranslation } from "react-i18next";

interface SettingsItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  to: string;
}

const SettingsItem: React.FC<SettingsItemProps> = ({ icon, title, description, to }) => {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={() => navigate(to)}
    >
      <CardHeader className="flex flex-row items-center gap-4 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="text-sm">{description}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
};

const Settings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Container className="flex h-16 items-center gap-4">
          <Link to="/home">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
        </Container>
      </header>

      {/* Content */}
      <main className="py-6">
        <Container>
          <div className="mx-auto max-w-2xl space-y-2">
            <SettingsItem
              icon={<Settings2 className="h-5 w-5" />}
              title={t("settings.general.title")}
              description={t("settings.general.description")}
              to="/settings/general"
            />

            <SettingsItem
              icon={<Bot className="h-5 w-5" />}
              title={t("settings.ai.title")}
              description={t("settings.ai.description")}
              to="/settings/ai"
            />

            <SettingsItem
              icon={<ImageIcon className="h-5 w-5" />}
              title={t("settings.storage.title")}
              description={t("settings.storage.description")}
              to="/settings/storage"
            />
          </div>
        </Container>
      </main>
    </div>
  );
};

export default Settings;
