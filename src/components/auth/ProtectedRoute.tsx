import { useAuth } from "@/hooks/useAuth";
import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * A wrapper component that protects routes requiring authentication.
 * Redirects to the sign-in page if the user is not signed in.
 *
 * 未ログイン時は元のパス + クエリ + ハッシュを `returnTo` として `/sign-in` に
 * 渡すことで、サインイン → OAuth コールバック経由で同じ URL（例:
 * `/notes/me?clipUrl=...`）に復帰できるようにする。`returnTo` は
 * `AuthCallback` 側の `getSafeReturnTarget` で `ALLOWED_RETURN_PATHS` と
 * 突き合わせるため、許可リストに含まれないパスは自動的に既定ランディングへ
 * フォールバックされる。
 *
 * On guest access, the original `pathname + search + hash` is forwarded as a
 * `returnTo` query parameter to `/sign-in`, so the post-auth callback can
 * resume the same URL (e.g. the Chrome-extension `clipUrl` hand-off via
 * `/notes/me?clipUrl=...`). `AuthCallback` validates `returnTo` against
 * `ALLOWED_RETURN_PATHS` so any unrecognized path falls back to the default
 * landing.
 *
 * Note: E2E test mode is handled at the useAuth hook level via VITE_E2E_TEST.
 */
export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const location = useLocation();

  // Show loading state while Clerk is initializing
  if (!isLoaded) {
    return (
      fallback ?? (
        <div className="flex h-screen items-center justify-center">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
        </div>
      )
    );
  }

  // Redirect to sign-in page if not signed in.
  // 未ログインならサインインへ。`returnTo` クエリで元 URL を保持し、
  // クリップ URL のような付随クエリも復帰できるようにする。
  if (!isSignedIn) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    const signInTarget =
      returnTo && returnTo !== "/"
        ? `/sign-in?${new URLSearchParams({ returnTo }).toString()}`
        : "/sign-in";
    return <Navigate to={signInTarget} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/**
 * A wrapper component that shows different content based on auth state.
 */
interface AuthGateProps {
  signedIn: ReactNode;
  signedOut: ReactNode;
  loading?: ReactNode;
}

/**
 *
 */
export function AuthGate({ signedIn, signedOut, loading }: AuthGateProps) {
  /**
   *
   */
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      loading ?? (
        <div className="flex h-screen items-center justify-center">
          <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
        </div>
      )
    );
  }

  return <>{isSignedIn ? signedIn : signedOut}</>;
}
