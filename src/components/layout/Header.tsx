// Header component with logo and avatar dropdown menu
import { createSignal, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Avatar } from "../ui/Avatar";
import { supabase } from "../../lib/supabase";

export interface HeaderProps {
  /** User name for avatar */
  userName?: string;
  /** User avatar URL */
  userAvatarUrl?: string;
  /** Whether user is logged in */
  isLoggedIn?: boolean;
}

export function Header(props: HeaderProps) {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = createSignal(
    document.documentElement.classList.contains("dark")
  );

  const toggleDarkMode = () => {
    const newValue = !darkMode();
    setDarkMode(newValue);
    document.documentElement.classList.toggle("dark", newValue);
    localStorage.setItem("darkMode", newValue ? "dark" : "light");
  };

  const handleLogout = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <header class="sticky top-0 z-sticky bg-[var(--bg-base)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
      <div class="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <A href="/" class="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <span class="text-white font-bold text-lg">Z</span>
          </div>
          <span class="text-xl font-semibold text-[var(--text-primary)]">Zedi</span>
        </A>

        {/* Avatar with Dropdown */}
        <Show
          when={props.isLoggedIn}
          fallback={
            <A href="/login">
              <button class="px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors">
                ログイン
              </button>
            </A>
          }
        >
          <DropdownMenu>
            <DropdownMenu.Trigger class="outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-full">
              <Avatar
                src={props.userAvatarUrl}
                name={props.userName}
                size="sm"
                isBordered
                class="cursor-pointer hover:scale-105 transition-transform"
              />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                class="
                  min-w-[200px]
                  bg-[var(--bg-card)]
                  border border-[var(--border-default)]
                  rounded-xl
                  shadow-lg
                  py-2
                  z-[var(--z-popover)]
                  animate-[scale-in_0.15s_ease-out]
                  origin-top-right
                "
              >
                {/* User Info */}
                <div class="px-4 py-2 border-b border-[var(--border-subtle)]">
                  <p class="text-sm font-medium text-[var(--text-primary)] truncate">
                    {props.userName || "ユーザー"}
                  </p>
                </div>

                {/* Menu Items */}
                <DropdownMenu.Group class="py-1">
                  <DropdownMenu.Item
                    class="
                      flex items-center gap-3 px-4 py-2
                      text-sm text-[var(--text-primary)]
                      hover:bg-[var(--bg-base)] cursor-pointer
                      outline-none focus:bg-[var(--bg-base)]
                    "
                    onSelect={() => navigate("/profile")}
                  >
                    <svg class="w-4 h-4 text-[var(--text-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    プロフィール
                  </DropdownMenu.Item>

                  <DropdownMenu.Item
                    class="
                      flex items-center gap-3 px-4 py-2
                      text-sm text-[var(--text-primary)]
                      hover:bg-[var(--bg-base)] cursor-pointer
                      outline-none focus:bg-[var(--bg-base)]
                    "
                    onSelect={() => navigate("/settings")}
                  >
                    <svg class="w-4 h-4 text-[var(--text-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    設定
                  </DropdownMenu.Item>
                </DropdownMenu.Group>

                <DropdownMenu.Separator class="h-px my-1 bg-[var(--border-subtle)]" />

                {/* Dark Mode Toggle */}
                <DropdownMenu.Item
                  class="
                    flex items-center justify-between px-4 py-2
                    text-sm text-[var(--text-primary)]
                    hover:bg-[var(--bg-base)] cursor-pointer
                    outline-none focus:bg-[var(--bg-base)]
                  "
                  onSelect={toggleDarkMode}
                  closeOnSelect={false}
                >
                  <div class="flex items-center gap-3">
                    <Show
                      when={darkMode()}
                      fallback={
                        <svg class="w-4 h-4 text-[var(--text-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="5" />
                          <line x1="12" y1="1" x2="12" y2="3" />
                          <line x1="12" y1="21" x2="12" y2="23" />
                          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                          <line x1="1" y1="12" x2="3" y2="12" />
                          <line x1="21" y1="12" x2="23" y2="12" />
                          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </svg>
                      }
                    >
                      <svg class="w-4 h-4 text-[var(--text-tertiary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                    </Show>
                    {darkMode() ? "ダークモード" : "ライトモード"}
                  </div>
                  <div class={`w-8 h-5 rounded-full transition-colors ${darkMode() ? "bg-primary-500" : "bg-neutral-300"}`}>
                    <div class={`w-4 h-4 mt-0.5 rounded-full bg-white shadow transition-transform ${darkMode() ? "translate-x-3.5" : "translate-x-0.5"}`} />
                  </div>
                </DropdownMenu.Item>

                <DropdownMenu.Separator class="h-px my-1 bg-[var(--border-subtle)]" />

                {/* Logout */}
                <DropdownMenu.Item
                  class="
                    flex items-center gap-3 px-4 py-2
                    text-sm text-error-600 dark:text-error-400
                    hover:bg-error-50 dark:hover:bg-error-900/20 cursor-pointer
                    outline-none focus:bg-error-50 dark:focus:bg-error-900/20
                  "
                  onSelect={handleLogout}
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  ログアウト
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
        </Show>
      </div>
    </header>
  );
}

export default Header;
