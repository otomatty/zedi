import React, { useRef, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Compass, DatabaseZap, ExternalLink } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { createStorageAdapter } from "@/lib/storageAdapter";
import { runApiSync, resetSyncFailures } from "@/lib/sync";
import { useQueryClient } from "@tanstack/react-query";
import { pageKeys } from "@/hooks/usePageQueries";

interface GeneralSettingsProfileCardProps {
  profile: { displayName?: string; avatarUrl?: string };
  avatarUrl: string | undefined;
  displayName: string | undefined;
  updateProfileAndSave: (updates: { displayName?: string; avatarUrl?: string }) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
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
            value={profile.displayName ?? ""}
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
  settings: {
    theme: ThemeMode;
    editorFontSize: EditorFontSize;
    customFontSizePx?: number;
    locale: UILocale;
  };
  editorFontSizePx: number;
  updateTheme: (v: ThemeMode) => void;
  updateEditorFontSize: (v: EditorFontSize) => void;
  updateCustomFontSizePx: (px: number) => void;
  updateLocale: (v: UILocale) => void;
  onRunTourAgain: () => void;
}

function GeneralSettingsDisplayCards({
  settings,
  editorFontSizePx,
  updateTheme,
  updateEditorFontSize,
  updateCustomFontSizePx,
  updateLocale,
  onRunTourAgain,
}: GeneralSettingsDisplayCardsProps) {
  const { t } = useTranslation();
  const customPxInput =
    settings.editorFontSize === "custom" ? (settings.customFontSizePx ?? 16) : 16;
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex flex-col gap-2 sm:min-w-[140px]">
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
                        {t(`generalSettings.fontSize.${opt.value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {settings.editorFontSize === "custom" && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={12}
                      max={24}
                      value={customPxInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "") return;
                        const n = Number(value);
                        if (!Number.isNaN(n)) updateCustomFontSizePx(n);
                      }}
                      className="h-9 w-20"
                    />
                    <span className="text-sm text-muted-foreground">
                      {t("generalSettings.fontSize.customPx")}
                    </span>
                  </div>
                )}
              </div>
              <div
                className="flex min-h-[52px] flex-1 items-center rounded-md border border-border bg-muted/30 px-3 py-2"
                style={{ fontSize: editorFontSizePx }}
              >
                <span className="text-muted-foreground">
                  {t("generalSettings.fontSize.preview")}: {t("generalSettings.fontSize.sample")}
                </span>
              </div>
            </div>
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

function DataManagementCard() {
  const { t } = useTranslation();
  const { userId, getToken, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const handleResetDatabase = useCallback(async () => {
    if (isResetting || !userId || !isSignedIn) return;
    setIsResetting(true);
    try {
      const adapter = createStorageAdapter();
      await adapter.initialize(userId);
      await adapter.resetDatabase();

      // Re-initialize and trigger a full sync
      await adapter.initialize(userId);
      resetSyncFailures();
      await runApiSync(userId, getToken, { force: true, forceFullSyncWhenLocalEmpty: true });
      queryClient.invalidateQueries({ queryKey: pageKeys.all });
      toast.success(t("generalSettings.dataManagement.resetSuccess"));
    } catch (error) {
      console.error("Failed to reset database:", error);
      toast.error(t("generalSettings.dataManagement.resetFailed"));
    } finally {
      setIsResetting(false);
    }
  }, [isResetting, userId, isSignedIn, getToken, queryClient, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseZap className="h-5 w-5" />
          {t("generalSettings.dataManagement.title")}
        </CardTitle>
        <CardDescription>{t("generalSettings.dataManagement.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-destructive/40 p-4">
          <h3 className="text-sm font-semibold">
            {t("generalSettings.dataManagement.resetTitle")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("generalSettings.dataManagement.resetDescription")}
          </p>
          <div className="mt-4 flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isResetting}>
                  {isResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("generalSettings.dataManagement.resetButton")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("generalSettings.dataManagement.resetConfirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("generalSettings.dataManagement.resetConfirmDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetDatabase} disabled={isResetting}>
                    {t("generalSettings.dataManagement.resetButton")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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
    updateProfile,
    save: saveProfile,
    displayName,
    avatarUrl,
  } = useProfile();

  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarObjectUrlRef = useRef<string | null>(null);

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
    },
    [updateProfileAndSave, profile.avatarUrl],
  );

  useEffect(() => {
    return () => {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
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
        editorFontSizePx={editorFontSizePx}
        updateTheme={updateTheme}
        updateEditorFontSize={updateEditorFontSize}
        updateCustomFontSizePx={updateCustomFontSizePx}
        updateLocale={updateLocale}
        onRunTourAgain={handleRunTourAgain}
      />

      {isSignedIn && <DataManagementCard />}

      <Card>
        <CardHeader>
          <CardTitle>{t("generalSettings.about.title")}</CardTitle>
          <CardDescription>{t("generalSettings.about.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {t("generalSettings.about.version")}:{" "}
            <span className="font-mono font-medium text-foreground">
              {import.meta.env.VITE_APP_VERSION ?? "—"}
            </span>
          </p>
          <Button variant="outline" size="sm" asChild className="w-fit">
            <a
              href="https://github.com/otomatty/zedi/releases"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("generalSettings.about.releaseNotes")}
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
