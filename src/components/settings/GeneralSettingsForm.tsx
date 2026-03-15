import React, { useRef, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@zedi/ui/components/sonner";
import { useTranslation } from "react-i18next";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { SectionSaveStatus } from "@/components/settings/SectionSaveStatus";
import { ProfileSettingsCard } from "@/components/settings/ProfileSettingsCard";
import { DisplaySettingsCard } from "@/components/settings/DisplaySettingsCard";
import { LanguageSettingsCard } from "@/components/settings/LanguageSettingsCard";
import { DataManagementCard } from "@/components/settings/DataManagementCard";
import { AboutCard } from "@/components/settings/AboutCard";

const PROFILE_SAVED_INDICATOR_MS = 3000;

/**
 * General settings form (profile, display, language, data, about).
 * 一般設定フォーム（プロフィール・表示・言語・データ・About）。
 */
export const GeneralSettingsForm: React.FC = () => {
  const {
    settings,
    isLoading: isGeneralLoading,
    updateTheme,
    updateEditorFontSize,
    updateCustomFontSizePx,
    updateLocale,
    editorFontSizePx,
  } = useGeneralSettings();

  const {
    profile,
    isLoading: isProfileLoading,
    isSaving: isProfileSaving,
    updateProfile,
    save: saveProfile,
    displayName,
    avatarUrl,
  } = useProfile();

  const { t } = useTranslation();
  const { isSignedIn } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarObjectUrlRef = useRef<string | null>(null);
  const [profileSavedAt, setProfileSavedAt] = useState<number | null>(null);
  const profileSavedAtTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLoading = isGeneralLoading || isProfileLoading;

  const runProfileSave = useCallback(async () => {
    const ok = await saveProfile();
    if (ok) {
      setProfileSavedAt(Date.now());
      if (profileSavedAtTimeoutRef.current) clearTimeout(profileSavedAtTimeoutRef.current);
      profileSavedAtTimeoutRef.current = setTimeout(() => {
        setProfileSavedAt(null);
        profileSavedAtTimeoutRef.current = null;
      }, PROFILE_SAVED_INDICATOR_MS);
    } else {
      toast.error(t("generalSettings.saveFailed"));
    }
  }, [saveProfile, t]);
  const scheduleProfileSave = useDebouncedCallback(runProfileSave, 800);

  const updateProfileAndSave = useCallback(
    (updates: Parameters<typeof updateProfile>[0]) => {
      if (profileSavedAtTimeoutRef.current) {
        clearTimeout(profileSavedAtTimeoutRef.current);
        profileSavedAtTimeoutRef.current = null;
      }
      setProfileSavedAt(null);
      updateProfile(updates);
      scheduleProfileSave();
    },
    [updateProfile, scheduleProfileSave],
  );

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
      updateProfileAndSave({ avatarUrl: objectUrl });
      e.currentTarget.value = "";
    },
    [updateProfileAndSave, profile.avatarUrl],
  );

  const handleAvatarRemove = useCallback(() => {
    if (profile.avatarUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(profile.avatarUrl);
    }
    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
      avatarObjectUrlRef.current = null;
    }
    updateProfileAndSave({ avatarUrl: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [updateProfileAndSave, profile.avatarUrl]);

  useEffect(() => {
    return () => {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
      if (profileSavedAtTimeoutRef.current) {
        clearTimeout(profileSavedAtTimeoutRef.current);
        profileSavedAtTimeoutRef.current = null;
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const profileSaveStatus = isProfileSaving ? "saving" : profileSavedAt != null ? "saved" : "idle";

  return (
    <div className="space-y-6">
      {isSignedIn && profileSaveStatus !== "idle" && (
        <SectionSaveStatus status={profileSaveStatus} />
      )}
      {isSignedIn && (
        <ProfileSettingsCard
          profile={profile}
          avatarUrl={avatarUrl}
          displayName={displayName}
          updateProfileAndSave={updateProfileAndSave}
          fileInputRef={fileInputRef}
          onAvatarFileChange={handleAvatarFileChange}
          onAvatarRemove={handleAvatarRemove}
        />
      )}

      <DisplaySettingsCard
        theme={settings.theme}
        editorFontSize={settings.editorFontSize}
        customFontSizePx={settings.customFontSizePx}
        editorFontSizePx={editorFontSizePx}
        updateTheme={updateTheme}
        updateEditorFontSize={updateEditorFontSize}
        updateCustomFontSizePx={updateCustomFontSizePx}
      />

      <LanguageSettingsCard locale={settings.locale} onLocaleChange={updateLocale} />

      {isSignedIn && <DataManagementCard />}

      <AboutCard />
    </div>
  );
};
