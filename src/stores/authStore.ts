import { createSignal, createRoot, onCleanup } from "solid-js";
import { supabase, hasValidCredentials } from "../lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

function createAuthStore() {
  const [user, setUser] = createSignal<User | null>(null);
  const [session, setSession] = createSignal<Session | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  // Initialize auth state
  const initialize = async () => {
    // If credentials are not valid, skip initialization and set loading to false
    if (!hasValidCredentials) {
      console.log("Supabase not configured, skipping auth initialization");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      if (!supabase) {
        throw new Error("Supabase client not initialized");
      }
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
    } catch (err) {
      console.error("Failed to get session:", err);
      setError("認証状態の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // Listen to auth state changes (only if credentials are valid)
  let subscription: { unsubscribe: () => void } | null = null;
  
  if (hasValidCredentials && supabase) {
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
      });
      subscription = data.subscription;
    } catch (err) {
      console.error("Failed to set up auth state listener:", err);
      setLoading(false);
    }
  } else {
    // When credentials are not valid, immediately set loading to false
    setLoading(false);
  }

  // Cleanup subscription
  onCleanup(() => {
    subscription?.unsubscribe();
  });

  // Sign in with Google
  const signInWithGoogle = async () => {
    if (!hasValidCredentials) {
      setError("Supabaseが設定されていません。.envファイルを確認してください。");
      return;
    }

    try {
      setError(null);
      if (!supabase) {
        throw new Error("Supabase client not initialized");
      }
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (authError) {
        setError(authError.message);
      }
    } catch (err) {
      console.error("Google sign in failed:", err);
      setError("ログインに失敗しました");
    }
  };

  // Sign out
  const signOut = async () => {
    if (!hasValidCredentials) {
      return;
    }

    try {
      setError(null);
      if (!supabase) {
        throw new Error("Supabase client not initialized");
      }
      const { error: authError } = await supabase.auth.signOut();
      if (authError) {
        setError(authError.message);
      }
    } catch (err) {
      console.error("Sign out failed:", err);
      setError("ログアウトに失敗しました");
    }
  };

  // Initialize on store creation
  initialize();

  return {
    user,
    session,
    loading,
    error,
    signInWithGoogle,
    signOut,
    isAuthenticated: () => !!session(),
    hasValidCredentials: () => hasValidCredentials,
  };
}

// Create a singleton store
export const authStore = createRoot(createAuthStore);

