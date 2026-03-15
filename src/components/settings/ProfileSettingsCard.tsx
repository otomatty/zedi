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
  /** Called when user removes avatar; parent should revoke blob URL and clear ref before updating. */
  onAvatarRemove?: () => void;
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
  onAvatarRemove,
}: ProfileSettingsCardProps) {
  const { t } = useTranslation();
  const handleAvatarRemove = onAvatarRemove ?? (() => updateProfileAndSave({ avatarUrl: "" }));
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
          onAvatarRemove={handleAvatarRemove}
          hasCustomAvatar={!!profile.avatarUrl}
          fileInputRef={fileInputRef}
          idPrefix="profile"
        />
      </CardContent>
    </Card>
  );
}
