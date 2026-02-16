import React, { useRef, useCallback, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useProfile } from "@/hooks/useProfile";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { LOCALE_OPTIONS, type UILocale } from "@/types/generalSettings";

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

  const handleAvatarFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const objectUrl = URL.createObjectURL(file);
      updateProfile({ avatarUrl: objectUrl });
    },
    [updateProfile],
  );

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 py-4">
        <h1 className="text-lg font-semibold">{t("onboarding.title")}</h1>
        <div className="flex gap-2 mt-2">
          {STEPS.map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
              aria-hidden
            />
          ))}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          {/* Step 1: Profile */}
          {step === 1 && (
            <>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-medium">
                  {t("onboarding.profile.heading")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("onboarding.profile.description")}
                </p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="onboarding-displayName">
                    {t("generalSettings.profile.displayName")}
                  </Label>
                  <Input
                    id="onboarding-displayName"
                    value={profile.displayName}
                    onChange={(e) =>
                      updateProfile({ displayName: e.target.value })
                    }
                    placeholder={t("generalSettings.profile.displayNamePlaceholder")}
                    maxLength={100}
                    aria-invalid={displayNameInvalid}
                    aria-describedby={displayNameInvalid ? "onboarding-displayName-error" : undefined}
                  />
                  {displayNameInvalid && (
                    <p
                      id="onboarding-displayName-error"
                      className="text-xs text-destructive"
                      role="alert"
                    >
                      {t("onboarding.profile.displayNameRequired")}
                    </p>
                  )}
                  {!displayNameInvalid && (
                    <p className="text-xs text-muted-foreground">
                      {t("generalSettings.profile.displayNameHelp")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{t("generalSettings.profile.avatar")}</Label>
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage
                        src={profile.avatarUrl || avatarUrl}
                        alt={displayName}
                      />
                      <AvatarFallback className="text-lg">
                        {displayName?.charAt(0) ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {t("generalSettings.profile.avatarUpload")}
                      </Button>
                      {profile.avatarUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => updateProfile({ avatarUrl: "" })}
                        >
                          {t("generalSettings.profile.avatarRemove")}
                        </Button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 2: Language */}
          {step === 2 && (
            <>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-medium">
                  {t("onboarding.language.heading")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("onboarding.language.description")}
                </p>
              </div>
              <div className="space-y-2">
                <Label id="onboarding-locale-label">
                  {t("generalSettings.language.label")}
                </Label>
                <Select
                  value={settings.locale}
                  onValueChange={(v) => updateLocale(v as UILocale)}
                >
                  <SelectTrigger
                    id="onboarding-locale"
                    aria-labelledby="onboarding-locale-label"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Step 3: Tour choice */}
          {step === 3 && (
            <>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-medium">
                  {t("onboarding.tour.heading")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("onboarding.tour.description")}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleCompleteWithTour}
                  size="lg"
                  className="w-full"
                >
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
