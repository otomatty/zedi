import { type ReactNode } from "react";
import { MockAuthProvider } from "./MockAuthProvider";

const isE2EMode = import.meta.env.VITE_E2E_TEST === "true";

/**
 * Root wrapper: uses {@link MockAuthProvider} when E2E env is set; otherwise passes children through.
 * ルート用ラッパー。E2E 時は {@link MockAuthProvider}、それ以外は子をそのまま通す。
 */
export function MainAuthProvider({ children }: { children: ReactNode }) {
  if (isE2EMode) {
    return <MockAuthProvider>{children}</MockAuthProvider>;
  }
  return <>{children}</>;
}
