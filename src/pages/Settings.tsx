import React from "react";
import { useSearchParams } from "react-router-dom";
import Container from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
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
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t("settings.title")}
        backTo={backTo}
        backLabel={t("common.back")}
        actions={<SettingsHeaderNav value={currentSection} onChange={setSection} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto py-6">
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
      </div>
    </div>
  );
};

export default Settings;
