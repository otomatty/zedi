// プロフィール取得・更新フック（Better Auth セッション + バックエンド API 連携）

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth, useUser } from "@/hooks/useAuth";

interface ProfileData {
  displayName: string;
  avatarUrl: string;
}

interface UseProfileReturn {
  /** バックエンド優先、IdP フォールバックの表示用名前 */
  displayName: string;
  /** バックエンド優先、IdP フォールバックのアバター URL */
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

function getApiBaseUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
  return base.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
}

export function useProfile(): UseProfileReturn {
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  const [profile, setProfile] = useState<ProfileData>(() => {
    const cached = loadCachedProfile();
    return cached ?? { displayName: "", avatarUrl: "" };
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      setIsLoading(false);
      return;
    }
    const fetchProfile = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/users/me`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as {
            user?: { name?: string; image?: string };
          };
          const rawDisplayName = data?.user?.name ?? "";
          const rawAvatarUrl = data?.user?.image ?? "";
          const displayName =
            rawDisplayName.trim() !== ""
              ? rawDisplayName
              : (user?.fullName ?? user?.username ?? "").trim();
          const fetched: ProfileData = {
            displayName,
            avatarUrl: rawAvatarUrl,
          };
          setProfile(fetched);
          saveCachedProfile(fetched);
        }
      } catch (error) {
        console.warn("Failed to fetch profile:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, [isSignedIn, user?.fullName, user?.username]);

  const updateProfile = useCallback((updates: Partial<ProfileData>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/update-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: profile.displayName || undefined,
          image: profile.avatarUrl || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Failed to update profile: ${res.status}`);
      saveCachedProfile(profile);
      return true;
    } catch (error) {
      console.error("Failed to save profile:", error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [profile]);

  // バックエンド優先、IdP フォールバック
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
