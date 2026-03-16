import React, { useRef, useCallback, useEffect } from "react";

/** Update function for profile (avatar URL). / プロフィール（アバターURL）更新用関数。 */
export type UpdateProfileFn = (updates: { avatarUrl?: string }) => void;

/** Return type of useOnboardingProfileAvatar. / useOnboardingProfileAvatar の戻り値の型。 */
export interface UseOnboardingProfileAvatarReturn {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleAvatarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAvatarRemove: () => void;
}

/**
 * Avatar file input and blob URL handling for onboarding profile step.
 * Manages file input ref, object URL lifecycle, and updateProfile calls.
 * オンボーディングのプロフィールステップ用アバター入力・blob URL 管理。
 */
export function useOnboardingProfileAvatar(
  profileAvatarUrl: string | undefined,
  updateProfile: UpdateProfileFn,
): UseOnboardingProfileAvatarReturn {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarObjectUrlRef = useRef<string | null>(null);

  const handleAvatarFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (profileAvatarUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(profileAvatarUrl);
      }
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
      const objectUrl = URL.createObjectURL(file);
      avatarObjectUrlRef.current = objectUrl;
      updateProfile({ avatarUrl: objectUrl });
      e.currentTarget.value = "";
    },
    [updateProfile, profileAvatarUrl],
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
    if (profileAvatarUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(profileAvatarUrl);
    }
    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
      avatarObjectUrlRef.current = null;
    }
    updateProfile({ avatarUrl: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [profileAvatarUrl, updateProfile]);

  return { fileInputRef, handleAvatarFileChange, handleAvatarRemove };
}
