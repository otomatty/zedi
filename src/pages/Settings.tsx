import React from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@zedi/ui";
import { Link } from "react-router-dom";
import Container from "@/components/layout/Container";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsHeaderNav } from "@/components/settings/SettingsHeaderNav";
import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import { AISettingsForm } from "@/components/settings/AISettingsForm";
import { StorageSettingsForm } from "@/components/settings/StorageSettingsForm";
import type { SettingsSectionId } from "@/components/settings/SettingsSection";

const VALID_SECTIONS: readonly SettingsSectionId[] = ["general", "ai", "storage"];
type SectionParam = SettingsSectionId;

function isValidSection(s: string | null): s is SectionParam {
  return s !== null && (VALID_SECTIONS as readonly string[]).includes(s);
}

function getSafeReturnTo(searchParams: URLSearchParams): string | null {
  const returnTo = searchParams.get("returnTo");
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return null;
  return returnTo;
}

/**
 * Settings hub: categories (general, AI, storage) switched via header nav. Single panel per category.
 * 設定ハブ。ヘッダーナビでカテゴリ（一般・AI・ストレージ）を切り替え、1画面1カテゴリ表示。
 */
const Settings: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get("section");
  const returnTo = getSafeReturnTo(searchParams);
  const backTo = returnTo ?? "/home";

  const currentSection: SectionParam = isValidSection(section) ? section : "general";

  const setSection = (id: SectionParam) => {
    const next = new URLSearchParams(searchParams);
    next.set("section", id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link to={backTo} aria-label={t("common.back")}>
                <ArrowLeft className="h-5 w-5" aria-hidden />
              </Link>
            </Button>
            <h1 className="truncate text-xl font-semibold">{t("settings.title")}</h1>
          </div>
          <SettingsHeaderNav value={currentSection} onChange={setSection} />
        </Container>
      </header>

      <main className="py-6">
        <Container>
          <div className="mx-auto max-w-2xl space-y-6">
            <div>
              {currentSection === "general" && (
                <SettingsSection
                  id="general"
                  title={t("settings.general.title")}
                  description={t("settings.general.description")}
                >
                  <GeneralSettingsForm />
                </SettingsSection>
              )}
              {currentSection === "ai" && (
                <SettingsSection
                  id="ai"
                  title={t("settings.ai.title")}
                  description={t("settings.ai.description")}
                >
                  <AISettingsForm embedded />
                </SettingsSection>
              )}
              {currentSection === "storage" && (
                <SettingsSection
                  id="storage"
                  title={t("settings.storage.title")}
                  description={t("settings.storage.description")}
                >
                  <StorageSettingsForm embedded />
                </SettingsSection>
              )}
            </div>
          </div>
        </Container>
      </main>
    </div>
  );
};

export default Settings;
