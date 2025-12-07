import { Show, createEffect, type JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { authStore } from "../../stores/authStore";

interface AuthGuardProps {
  children: JSX.Element;
}

export function AuthGuard(props: AuthGuardProps) {
  const navigate = useNavigate();

  // Use createEffect to reactively handle redirect when auth state changes
  createEffect(() => {
    const isLoading = authStore.loading();
    const isAuthenticated = authStore.isAuthenticated();
    
    // Only redirect when loading is complete and user is not authenticated
    if (!isLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  });

  return (
    <Show
      when={!authStore.loading()}
      fallback={
        <div class="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
          <div class="flex flex-col items-center gap-4">
            {/* Spinner */}
            <div class="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
            <p class="text-[var(--text-secondary)]">読み込み中...</p>
          </div>
        </div>
      }
    >
      <Show
        when={authStore.isAuthenticated()}
        fallback={
          <div class="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
            <p class="text-[var(--text-secondary)]">リダイレクト中...</p>
          </div>
        }
      >
        {props.children}
      </Show>
    </Show>
  );
}
