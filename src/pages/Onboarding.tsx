import React, { useCallback, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@zedi/ui";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useOnboardingProfileAvatar } from "@/hooks/useOnboardingProfileAvatar";
import { useProfile } from "@/hooks/useProfile";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { ProfileFormFields } from "@/components/settings/ProfileFormFields";
import { LanguageSelectField } from "@/components/settings/LanguageSelectField";

const STEPS = [1, 2] as const;
type StepNum = (typeof STEPS)[number];

/**
 * Initial setup wizard page.
 * Step 1: Profile (display name, avatar)
 * Step 2: Language + completion
 *
 * セットアップ完了時に POST /api/onboarding/complete を呼び、プロフィール更新・
 * ウェルカムページ自動生成・セットアップ完了フラグをまとめてサーバーに記録する。
 *
 * Completion calls POST /api/onboarding/complete which atomically updates
 * the profile, creates the welcome page, and records the setup-completed
 * flag on the server.
 */
const Onboarding: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<StepNum>(1);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const { needsSetupWizard, completeSetupWizard } = useOnboarding();
  const {
    profile,
    isLoading: isProfileLoading,
    isSaving: isProfileSaving,
    updateProfile,
    displayName,
    avatarUrl,
  } = useProfile();
  const { settings, isLoading: isSettingsLoading, updateLocale } = useGeneralSettings();

  const { fileInputRef, handleAvatarFileChange, handleAvatarRemove } = useOnboardingProfileAvatar(
    profile.avatarUrl,
    updateProfile,
  );

  const displayNameInvalid = profile.displayName.trim() === "";

  const handleNext = useCallback(() => {
    if (step === 1 && !displayNameInvalid) setStep(2);
  }, [step, displayNameInvalid]);

  const handleBack = useCallback(() => {
    if (step === 2) setStep(1);
  }, [step]);

  const handleComplete = useCallback(async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    setCompleteError(null);
    try {
      const response = await completeSetupWizard({
        displayName: profile.displayName.trim(),
        avatarUrl: profile.avatarUrl || null,
        locale: settings.locale === "en" ? "en" : "ja",
      });
      const target = response.welcome_page_id ? `/pages/${response.welcome_page_id}` : "/home";
      navigate(target, { replace: true });
    } catch (error) {
      console.error("[Onboarding] completion failed:", error);
      setCompleteError(t("onboarding.action.completeError"));
      setIsCompleting(false);
    }
  }, [
    isCompleting,
    completeSetupWizard,
    profile.displayName,
    profile.avatarUrl,
    settings.locale,
    navigate,
    t,
  ]);

  const isLoading = isProfileLoading || isSettingsLoading;

  if (!needsSetupWizard) {
    return <Navigate to="/home" replace />;
  }

  if (isLoading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="border-b px-4 py-4">
        <h1 className="text-lg font-semibold">{t("onboarding.title")}</h1>
        <div className="mt-2 flex gap-2">
          {STEPS.map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`}
              aria-hidden
            />
          ))}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          {/* Step 1: Profile */}
          {step === 1 && (
            <>
              <div className="space-y-1 text-center">
                <h2 className="text-xl font-medium">{t("onboarding.profile.heading")}</h2>
                <p className="text-muted-foreground text-sm">
                  {t("onboarding.profile.description")}
                </p>
              </div>
              <ProfileFormFields
                displayName={profile.displayName}
                avatarDisplayUrl={profile.avatarUrl || avatarUrl}
                displayNameForAvatar={displayName}
                onDisplayNameChange={(value) => updateProfile({ displayName: value })}
                onAvatarChange={handleAvatarFileChange}
                onAvatarRemove={handleAvatarRemove}
                hasCustomAvatar={!!profile.avatarUrl}
                fileInputRef={fileInputRef}
                displayNameError={
                  displayNameInvalid ? t("onboarding.profile.displayNameRequired") : undefined
                }
                idPrefix="onboarding"
                disabled={isProfileSaving}
              />
            </>
          )}

          {/* Step 2: Language + completion */}
          {step === 2 && (
            <>
              <div className="space-y-1 text-center">
                <h2 className="text-xl font-medium">{t("onboarding.language.heading")}</h2>
                <p className="text-muted-foreground text-sm">
                  {t("onboarding.language.description")}
                </p>
              </div>
              <LanguageSelectField
                value={settings.locale}
                onChange={updateLocale}
                id="onboarding-locale"
                labelId="onboarding-locale-label"
              />
              {completeError && (
                <p className="text-destructive text-sm" role="alert">
                  {completeError}
                </p>
              )}
            </>
          )}

          <div className="flex gap-3 pt-4">
            {step === 2 && (
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1"
                disabled={isCompleting}
              >
                {t("onboarding.action.back")}
              </Button>
            )}
            {step === 1 && (
              <Button
                onClick={handleNext}
                className="w-full"
                disabled={displayNameInvalid || isProfileSaving}
              >
                {t("onboarding.action.next")}
              </Button>
            )}
            {step === 2 && (
              <Button onClick={handleComplete} className="flex-1" disabled={isCompleting}>
                {isCompleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("onboarding.action.complete")
                )}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Onboarding;
