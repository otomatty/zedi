import React, { useRef, useCallback, useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@zedi/ui";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useProfile } from "@/hooks/useProfile";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { ProfileFormFields } from "@/components/settings/ProfileFormFields";
import { LanguageSelectField } from "@/components/settings/LanguageSelectField";

const STEPS = [1, 2, 3] as const;
type StepNum = (typeof STEPS)[number];

/**
 * Initial setup wizard page.
 * Step 1: Profile (display name, avatar)
 * Step 2: Language
 * Step 3: Guide tour (start or skip)
 */
const Onboarding: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<StepNum>(1);

  const { needsSetupWizard, completeSetupWizard } = useOnboarding();
  const {
    profile,
    isLoading: isProfileLoading,
    isSaving: isProfileSaving,
    updateProfile,
    save: saveProfile,
    displayName,
    avatarUrl,
  } = useProfile();
  const { settings, isLoading: isSettingsLoading, updateLocale } = useGeneralSettings();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarObjectUrlRef = useRef<string | null>(null);

  const handleAvatarFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (profile.avatarUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(profile.avatarUrl);
      }
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
      const objectUrl = URL.createObjectURL(file);
      avatarObjectUrlRef.current = objectUrl;
      updateProfile({ avatarUrl: objectUrl });
    },
    [updateProfile, profile.avatarUrl],
  );

  useEffect(() => {
    return () => {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
    };
  }, []);

  const handleAvatarRemove = useCallback(() => {
    if (profile.avatarUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(profile.avatarUrl);
    }
    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
      avatarObjectUrlRef.current = null;
    }
    updateProfile({ avatarUrl: "" });
  }, [profile.avatarUrl, updateProfile]);

  const handleNext = useCallback(async () => {
    if (step === 1) {
      await saveProfile();
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }, [step, saveProfile]);

  const handleBack = useCallback(() => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }, [step]);

  const handleCompleteWithTour = useCallback(() => {
    completeSetupWizard();
    navigate("/home", { replace: true, state: { startTour: true } });
  }, [completeSetupWizard, navigate]);

  const handleCompleteSkip = useCallback(() => {
    completeSetupWizard();
    navigate("/home", { replace: true });
  }, [completeSetupWizard, navigate]);

  const isLoading = isProfileLoading || isSettingsLoading;
  const displayNameInvalid = profile.displayName.trim() === "";

  if (!needsSetupWizard) {
    return <Navigate to="/home" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
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
                <p className="text-sm text-muted-foreground">
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
              />
            </>
          )}

          {/* Step 2: Language */}
          {step === 2 && (
            <>
              <div className="space-y-1 text-center">
                <h2 className="text-xl font-medium">{t("onboarding.language.heading")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("onboarding.language.description")}
                </p>
              </div>
              <LanguageSelectField
                value={settings.locale}
                onChange={updateLocale}
                id="onboarding-locale"
                labelId="onboarding-locale-label"
              />
            </>
          )}

          {/* Step 3: Tour choice */}
          {step === 3 && (
            <>
              <div className="space-y-1 text-center">
                <h2 className="text-xl font-medium">{t("onboarding.tour.heading")}</h2>
                <p className="text-sm text-muted-foreground">{t("onboarding.tour.description")}</p>
              </div>
              <div className="flex flex-col gap-3">
                <Button onClick={handleCompleteWithTour} size="lg" className="w-full">
                  {t("onboarding.tour.startTour")}
                </Button>
                <Button
                  onClick={handleCompleteSkip}
                  variant="ghost"
                  size="lg"
                  className="w-full text-muted-foreground"
                >
                  {t("onboarding.tour.skip")}
                </Button>
              </div>
            </>
          )}

          {/* Step navigation (Step 1 and 2) */}
          {(step === 1 || step === 2) && (
            <div className="flex gap-3 pt-4">
              {step > 1 && (
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  {t("onboarding.action.back")}
                </Button>
              )}
              <Button
                onClick={handleNext}
                className={step === 1 ? "w-full" : "flex-1"}
                disabled={step === 1 && (displayNameInvalid || isProfileSaving)}
              >
                {t("onboarding.action.next")}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Onboarding;
