import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getAdminMe } from "@/api/admin";

type Props = { children: ReactNode };

/**
 * 管理者ログイン済みか確認し、未認証なら /login へリダイレクトする。
 */
export function AdminGuard({ children }: Props) {
  const [status, setStatus] = useState<"loading" | "ok" | "unauthorized">("loading");
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    getAdminMe()
      .then((me) => {
        if (cancelled) return;
        setStatus(me ? "ok" : "unauthorized");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("unauthorized");
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
        Loading...
      </div>
    );
  }
  if (status === "unauthorized") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
