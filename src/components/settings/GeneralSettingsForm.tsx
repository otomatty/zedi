import React, { useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Compass } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import {
  THEME_OPTIONS,
  FONT_SIZE_OPTIONS,
  LOCALE_OPTIONS,
  type ThemeMode,
  type EditorFontSize,
  type UILocale,
} from "@/types/generalSettings";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "react-i18next";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";

interface GeneralSettingsProfileCardProps {
  profile: { displayName?: string; avatarUrl?: string };
  avatarUrl: string | undefined;
  displayName: string | undefined;
  updateProfileAndSave: (updates: { displayName?: string; avatarUrl?: string }) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAvatarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function GeneralSettingsProfileCard({
  profile,
  avatarUrl,
  displayName,
  updateProfileAndSave,
  fileInputRef,
  onAvatarFileChange,
}: GeneralSettingsProfileCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("generalSettings.profile.title")}</CardTitle>
        <CardDescription>{t("generalSettings.profile.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="displayName">{t("generalSettings.profile.displayName")}</Label>
          <Input
            id="displayName"
            value={profile.displayName}
            onChange={(e) => updateProfileAndSave({ displayName: e.target.value })}
            placeholder={t("generalSettings.profile.displayNamePlaceholder")}
            maxLength={100}
          />
          <p className="text-xs text-muted-foreground">
            {t("generalSettings.profile.displayNameHelp")}
          </p>
        </div>
        <div className="space-y-3">
          <Label>{t("generalSettings.profile.avatar")}</Label>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile.avatarUrl || avatarUrl} alt={displayName} />
              <AvatarFallback className="text-lg">{displayName?.charAt(0) ?? "U"}</AvatarFallback>
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
                  onClick={() => updateProfileAndSave({ avatarUrl: "" })}
                >
                  {t("generalSettings.profile.avatarRemove")}
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onAvatarFileChange}
              className="hidden"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface GeneralSettingsDisplayCardsProps {
  settings: { theme: ThemeMode; editorFontSize: EditorFontSize; locale: UILocale };
  updateTheme: (v: ThemeMode) => void;
  updateEditorFontSize: (v: EditorFontSize) => void;
  updateLocale: (v: UILocale) => void;
  onRunTourAgain: () => void;
}

function GeneralSettingsDisplayCards({
  settings,
  updateTheme,
  updateEditorFontSize,
  updateLocale,
  onRunTourAgain,
}: GeneralSettingsDisplayCardsProps) {
  const { t } = useTranslation();
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("generalSettings.display.title")}</CardTitle>
          <CardDescription>{t("generalSettings.display.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="theme">{t("generalSettings.theme.label")}</Label>
            <Select value={settings.theme} onValueChange={(v) => updateTheme(v as ThemeMode)}>
              <SelectTrigger id="theme" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEME_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(`generalSettings.theme.${opt.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fontSize">{t("generalSettings.fontSize.label")}</Label>
            <Select
              value={settings.editorFontSize}
              onValueChange={(v) => updateEditorFontSize(v as EditorFontSize)}
            >
              <SelectTrigger id="fontSize" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(`generalSettings.fontSize.${opt.value}`)} ({opt.px}px)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5" />
            {t("generalSettings.tour.title")}
          </CardTitle>
          <CardDescription>{t("generalSettings.tour.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onRunTourAgain}>
            {t("generalSettings.tour.runAgain")}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("generalSettings.language.title")}</CardTitle>
          <CardDescription>{t("generalSettings.language.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="locale">{t("generalSettings.language.label")}</Label>
            <Select value={settings.locale} onValueChange={(v) => updateLocale(v as UILocale)}>
              <SelectTrigger id="locale" className="w-full">
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
        </CardContent>
      </Card>
    </>
  );
}

export const GeneralSettingsForm: React.FC = () => {
  const {
    settings,
    isLoading: isGeneralLoading,
    updateTheme,
    updateEditorFontSize,
    updateLocale,
  } = useGeneralSettings();

  const {
    profile,
    isLoading: isProfileLoading,
    updateProfile,
    save: saveProfile,
    displayName,
    avatarUrl,
  } = useProfile();

  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRunTourAgain = useCallback(() => {
    navigate("/home", { state: { startTour: true } });
  }, [navigate]);

  const isLoading = isGeneralLoading || isProfileLoading;

  const runProfileSave = useCallback(async () => {
    const ok = await saveProfile();
    if (ok) toast.success(t("generalSettings.saved"));
    else toast.error(t("generalSettings.saveFailed"));
  }, [saveProfile, t]);
  const scheduleProfileSave = useDebouncedCallback(runProfileSave, 800);

  const updateProfileAndSave = useCallback(
    (updates: Parameters<typeof updateProfile>[0]) => {
      updateProfile(updates);
      scheduleProfileSave();
    },
    [updateProfile, scheduleProfileSave],
  );

  const handleAvatarFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // ローカルプレビュー用に Object URL を使用
      // 実際の運用ではストレージにアップロードして URL を取得する
      const objectUrl = URL.createObjectURL(file);
      updateProfileAndSave({ avatarUrl: objectUrl });
    },
    [updateProfileAndSave],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isSignedIn && (
        <GeneralSettingsProfileCard
          profile={profile}
          avatarUrl={avatarUrl}
          displayName={displayName}
          updateProfileAndSave={updateProfileAndSave}
          fileInputRef={fileInputRef}
          onAvatarFileChange={handleAvatarFileChange}
        />
      )}

      <GeneralSettingsDisplayCards
        settings={settings}
        updateTheme={updateTheme}
        updateEditorFontSize={updateEditorFontSize}
        updateLocale={updateLocale}
        onRunTourAgain={handleRunTourAgain}
      />
    </div>
  );
};
