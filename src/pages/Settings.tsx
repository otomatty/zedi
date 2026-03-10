import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@zedi/ui";
import { Link } from "react-router-dom";
import Container from "@/components/layout/Container";
import { useTranslation } from "react-i18next";
import { SettingsOverview } from "@/components/settings/SettingsOverview";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useSettingsSummaries } from "@/components/settings/useSettingsSummaries";
import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import { AISettingsForm } from "@/components/settings/AISettingsForm";
import { StorageSettingsForm } from "@/components/settings/StorageSettingsForm";

const VALID_SECTIONS = ["general", "ai", "storage"] as const;
type SectionParam = (typeof VALID_SECTIONS)[number];

function isValidSection(s: string | null): s is SectionParam {
  return s !== null && VALID_SECTIONS.includes(s as SectionParam);
}

function getSafeReturnTo(searchParams: URLSearchParams): string | null {
  const returnTo = searchParams.get("returnTo");
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
  return returnTo;
}

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section");
  const summaries = useSettingsSummaries();
  const returnTo = getSafeReturnTo(searchParams);
  const backTo = returnTo ?? "/home";

  useEffect(() => {
    if (!isValidSection(section)) return;
    const el = document.getElementById(`section-${section}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [section]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Container className="flex h-16 items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link to={backTo} aria-label={t("common.back")}>
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
        </Container>
      </header>

      <main className="py-6">
        <Container>
          <div className="mx-auto max-w-2xl space-y-10">
            <p className="text-sm text-muted-foreground">{t("settings.hubDescription")}</p>

            <SettingsOverview summaries={summaries} />

            <SettingsSection
              id="general"
              title={t("settings.general.title")}
              description={t("settings.general.description")}
              summary={summaries.general || undefined}
            >
              <GeneralSettingsForm />
            </SettingsSection>

            <SettingsSection
              id="ai"
              title={t("settings.ai.title")}
              description={t("settings.ai.description")}
              summary={summaries.ai || undefined}
            >
              <AISettingsForm embedded />
            </SettingsSection>

            <SettingsSection
              id="storage"
              title={t("settings.storage.title")}
              description={t("settings.storage.description")}
              summary={summaries.storage || undefined}
            >
              <StorageSettingsForm embedded />
            </SettingsSection>
          </div>
        </Container>
      </main>
    </div>
  );
};

export default Settings;
