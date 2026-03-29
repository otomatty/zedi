import React from "react";
import { Button } from "@zedi/ui";
import { Input } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@zedi/ui";
import { useTranslation } from "react-i18next";

/**
 * Shared profile form fields (display name + avatar).
 * Used by Onboarding Step 1 and General settings profile card.
 * プロフィール入力フィールド（表示名・アバター）。オンボーディングと一般設定で共有。
 */
export interface ProfileFormFieldsProps {
  displayName: string;
  /** Avatar image URL to display (may be blob URL while editing). / アバター画像URL（編集中は blob URL のことがある）。 */
  avatarDisplayUrl: string;
  /** Fallback display name for avatar initial (e.g. from IdP). / アバター頭文字用の表示名（IdP 由来など）。 */
  displayNameForAvatar?: string;
  onDisplayNameChange: (value: string) => void;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAvatarRemove: () => void;
  /** When true, show the "Remove avatar" button (user has set a custom avatar). / true のとき「アバターを削除」ボタンを表示。 */
  hasCustomAvatar: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  /** Optional error message below display name (e.g. "Display name is required"). / 表示名の下に出す任意のエラーメッセージ。 */
  displayNameError?: string;
  /** Optional id prefix for inputs (e.g. "onboarding" for onboarding-displayName). / 入力要素の id プレフィックス（例: onboarding）。 */
  idPrefix?: string;
  disabled?: boolean;
}

/**
 * Profile form fields (display name and avatar). Shared by Onboarding and settings.
 * プロフィール入力（表示名・アバター）。オンボーディングと設定で共有。
 */
export const ProfileFormFields: React.FC<ProfileFormFieldsProps> = ({
  displayName,
  avatarDisplayUrl,
  displayNameForAvatar,
  onDisplayNameChange,
  onAvatarChange,
  onAvatarRemove,
  hasCustomAvatar,
  fileInputRef,
  displayNameError,
  idPrefix = "profile",
  disabled = false,
}) => {
  const { t } = useTranslation();
  const displayNameId = `${idPrefix}-displayName`;
  const errorId = displayNameError ? `${idPrefix}-displayName-error` : undefined;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={displayNameId}>{t("generalSettings.profile.displayName")}</Label>
        <Input
          id={displayNameId}
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder={t("generalSettings.profile.displayNamePlaceholder")}
          maxLength={100}
          disabled={disabled}
          aria-invalid={!!displayNameError}
          aria-describedby={errorId}
        />
        {displayNameError && (
          <p id={errorId} className="text-destructive text-xs" role="alert">
            {displayNameError}
          </p>
        )}
        {!displayNameError && (
          <p className="text-muted-foreground text-xs">
            {t("generalSettings.profile.displayNameHelp")}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label>{t("generalSettings.profile.avatar")}</Label>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage
              src={avatarDisplayUrl || undefined}
              alt={displayNameForAvatar ?? displayName}
            />
            <AvatarFallback className="text-lg">
              {(displayNameForAvatar ?? displayName)?.charAt(0) ?? "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              {t("generalSettings.profile.avatarUpload")}
            </Button>
            {hasCustomAvatar && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={onAvatarRemove}
                disabled={disabled}
              >
                {t("generalSettings.profile.avatarRemove")}
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onAvatarChange}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};
