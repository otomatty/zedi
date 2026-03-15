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
  /** Avatar image URL to display (may be blob URL while editing). */
  avatarDisplayUrl: string;
  /** Fallback display name for avatar initial (e.g. from IdP). */
  displayNameForAvatar?: string;
  onDisplayNameChange: (value: string) => void;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAvatarRemove: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  /** Optional error message below display name (e.g. "Display name is required"). */
  displayNameError?: string;
  /** Optional id prefix for inputs (e.g. "onboarding" for onboarding-displayName). */
  idPrefix?: string;
  disabled?: boolean;
}

/**
 *
 */
export /**
 *
 */
const ProfileFormFields: React.FC<ProfileFormFieldsProps> = ({
  displayName,
  avatarDisplayUrl,
  displayNameForAvatar,
  onDisplayNameChange,
  onAvatarChange,
  onAvatarRemove,
  fileInputRef,
  displayNameError,
  idPrefix = "profile",
  disabled = false,
}) => {
  /**
   *
   */
  const { t } = useTranslation();
  /**
   *
   */
  const displayNameId = `${idPrefix}-displayName`;
  /**
   *
   */
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
          <p id={errorId} className="text-xs text-destructive" role="alert">
            {displayNameError}
          </p>
        )}
        {!displayNameError && (
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
            {avatarDisplayUrl && (
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
            ref={fileInputRef as React.RefObject<HTMLInputElement>}
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
