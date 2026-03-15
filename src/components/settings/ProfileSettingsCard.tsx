import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { ProfileFormFields } from "@/components/settings/ProfileFormFields";

/** Props for ProfileSettingsCard. プロフィール設定カードのプロパティ。 */
export interface ProfileSettingsCardProps {
  profile: { displayName?: string; avatarUrl?: string };
  avatarUrl: string | undefined;
  displayName: string | undefined;
  updateProfileAndSave: (updates: { displayName?: string; avatarUrl?: string }) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onAvatarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Profile section card for General settings (display name, avatar).
 * 一般設定のプロフィールカード
 */
export function ProfileSettingsCard({
  profile,
  avatarUrl,
  displayName,
  updateProfileAndSave,
  fileInputRef,
  onAvatarFileChange,
}: ProfileSettingsCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("generalSettings.profile.title")}</CardTitle>
        <CardDescription>{t("generalSettings.profile.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ProfileFormFields
          displayName={profile.displayName ?? ""}
          avatarDisplayUrl={profile.avatarUrl || avatarUrl}
          displayNameForAvatar={displayName}
          onDisplayNameChange={(value) => updateProfileAndSave({ displayName: value })}
          onAvatarChange={onAvatarFileChange}
          onAvatarRemove={() => updateProfileAndSave({ avatarUrl: "" })}
          hasCustomAvatar={!!profile.avatarUrl}
          fileInputRef={fileInputRef}
          idPrefix="profile"
        />
      </CardContent>
    </Card>
  );
}
