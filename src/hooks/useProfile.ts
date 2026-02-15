// プロフィール取得・更新フック（バックエンド API 連携）

import { useState, useEffect, useCallback, useMemo } from "react";
import { createApiClient } from "@/lib/api";
import { useAuth, useUser } from "@/hooks/useAuth";

interface ProfileData {
  displayName: string;
  avatarUrl: string;
}

interface UseProfileReturn {
  /** バックエンド優先、Cognito フォールバックの表示用名前 */
  displayName: string;
  /** バックエンド優先、Cognito フォールバックのアバター URL */
  avatarUrl: string;
  /** バックエンドのプロフィール（編集用） */
  profile: ProfileData;
  /** プロフィール読み込み中 */
  isLoading: boolean;
  /** 保存中 */
  isSaving: boolean;
  /** フォーム値を更新 */
  updateProfile: (updates: Partial<ProfileData>) => void;
  /** バックエンドに保存 */
  save: () => Promise<boolean>;
}

const PROFILE_CACHE_KEY = "zedi-profile-cache";

function loadCachedProfile(): ProfileData | null {
  try {
    const cached = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!cached) return null;
    return JSON.parse(cached) as ProfileData;
  } catch {
    return null;
  }
}

function saveCachedProfile(profile: ProfileData): void {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export function useProfile(): UseProfileReturn {
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();

  const [profile, setProfile] = useState<ProfileData>(() => {
    const cached = loadCachedProfile();
    return cached ?? { displayName: "", avatarUrl: "" };
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // バックエンドからプロフィールを取得（upsert レスポンスを利用）
  useEffect(() => {
    if (!isSignedIn) {
      setIsLoading(false);
      return;
    }
    const fetchProfile = async () => {
      try {
        const api = createApiClient({ getToken });
        // upsert を body なしで呼ぶと現在のユーザー情報が返る想定
        const result = await api.upsertMe({}) as Record<string, unknown> | null;
        if (result && typeof result === "object") {
          const fetched: ProfileData = {
            displayName: (result.display_name as string) ?? "",
            avatarUrl: (result.avatar_url as string) ?? "",
          };
          setProfile(fetched);
          saveCachedProfile(fetched);
        }
      } catch (error) {
        console.warn("Failed to fetch profile:", error);
        // キャッシュまたは空のまま
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, [isSignedIn, getToken]);

  const updateProfile = useCallback((updates: Partial<ProfileData>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const api = createApiClient({ getToken });
      await api.upsertMe({
        display_name: profile.displayName || undefined,
        avatar_url: profile.avatarUrl || undefined,
      });
      saveCachedProfile(profile);
      return true;
    } catch (error) {
      console.error("Failed to save profile:", error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [getToken, profile]);

  // バックエンド優先、Cognito フォールバック
  const displayName = useMemo(() => {
    if (profile.displayName) return profile.displayName;
    return user?.fullName ?? user?.username ?? "";
  }, [profile.displayName, user?.fullName, user?.username]);

  const avatarUrl = useMemo(() => {
    if (profile.avatarUrl) return profile.avatarUrl;
    return user?.imageUrl ?? "";
  }, [profile.avatarUrl, user?.imageUrl]);

  return {
    displayName,
    avatarUrl,
    profile,
    isLoading,
    isSaving,
    updateProfile,
    save,
  };
}
