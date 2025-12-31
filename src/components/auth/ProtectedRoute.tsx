import { useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * A wrapper component that protects routes requiring authentication.
 * Redirects to the home page if the user is not signed in.
 */
export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const location = useLocation();

  // Show loading state while Clerk is initializing
  if (!isLoaded) {
    return (
      fallback ?? (
        <div className="flex h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )
    );
  }

  // Redirect to home if not signed in
  if (!isSignedIn) {
    return <Navigate to="/" state={{ from: location }} replace />;
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

export function AuthGate({ signedIn, signedOut, loading }: AuthGateProps) {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      loading ?? (
        <div className="flex h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )
    );
  }

  return <>{isSignedIn ? signedIn : signedOut}</>;
}
