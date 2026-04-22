import { Toaster } from "@zedi/ui";
import { Toaster as Sonner } from "@zedi/ui/components/sonner";
import { TooltipProvider } from "@zedi/ui";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useParams,
} from "react-router-dom";
import Landing from "./pages/Landing";
import Home from "./pages/Home";
import Notes from "./pages/Notes";
import NotesDiscover from "./pages/NotesDiscover";
import SignIn from "./pages/SignIn";
import AuthCallback from "./pages/AuthCallback";
import ExtensionAuth from "./pages/ExtensionAuth";
import ExtensionAuthCallback from "./pages/ExtensionAuthCallback";
import McpAuthorize from "./pages/McpAuthorize";
import PageEditorPage from "./pages/PageEditor";
import Settings from "./pages/Settings";
import WikiSchemaPage from "./pages/WikiSchemaPage";
import IndexPage from "./pages/IndexPage";
import Pricing from "./pages/Pricing";
import Donate from "./pages/Donate";
import SearchResults from "./pages/SearchResults";
import NotFound from "./pages/NotFound";
import NoteView from "./pages/NoteView";
import NotePageView from "./pages/NotePageView";
import NoteSettings from "./pages/NoteSettings";
import NoteMembers from "./pages/NoteMembers";
import Onboarding from "./pages/Onboarding";
import AIChatHistory from "./pages/AIChatHistory";
import AIChatLanding from "./pages/AIChatLanding";
import AIChatDetail from "./pages/AIChatDetail";
import InvitePage from "./pages/InvitePage";
import InviteLinkPage from "./pages/InviteLinkPage";
import { GlobalSearchProvider } from "./contexts/GlobalSearchContext";
import { GlobalShortcutsProvider } from "./components/layout/GlobalShortcutsProvider";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AIChatProvider } from "./contexts/AIChatContext";
import { AIChatConversationsProvider } from "./hooks/useAIChatConversations";
import { FilePreviewDialogHost } from "./components/note/FilePreviewDialogHost";
import { AppLayout } from "./components/layout/AppLayout";

const queryClient = new QueryClient();

/**
 * Redirect `/ai-chat/*` legacy URLs to `/ai/*`.
 * 旧パス `/ai-chat/*` を `/ai/*` へリダイレクト。
 */
function LegacyAIChatConversationRedirect() {
  const { conversationId } = useParams<{ conversationId: string }>();
  return <Navigate to={`/ai/${conversationId}`} replace />;
}

/**
 * Redirect singular `/page/:id` to plural `/pages/:id` while preserving search/hash.
 * 旧パス `/page/:id` を複数形 `/pages/:id` にリダイレクト（search/hash は保持）。
 */
function LegacyPageRedirect() {
  const { id } = useParams<{ id: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={`/pages/${id}${search}${hash}`} replace />;
}

/**
 * Redirect singular `/note/:noteId` (and sub-routes) to plural `/notes/:noteId/...`.
 * 旧パス `/note/:noteId` 系を複数形 `/notes/:noteId/...` にリダイレクト。
 */
function LegacyNoteRedirect({ suffix }: { suffix?: "settings" | "members" }) {
  const { noteId } = useParams<{ noteId: string }>();
  const { search, hash } = useLocation();
  const tail = suffix ? `/${suffix}` : "";
  return <Navigate to={`/notes/${noteId}${tail}${search}${hash}`} replace />;
}

/**
 * Redirect `/note/:noteId/page/:pageId` to `/notes/:noteId/:pageId`.
 * 旧パス `/note/:noteId/page/:pageId` を新ルートへリダイレクト。
 */
function LegacyNotePageRedirect() {
  const { noteId, pageId } = useParams<{ noteId: string; pageId: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={`/notes/${noteId}/${pageId}${search}${hash}`} replace />;
}

/**
 * Redirect `/notes/:noteId/pages/:pageId` to `/notes/:noteId/:pageId`.
 * 旧パス `/notes/:noteId/pages/:pageId` を新しい短縮パスへリダイレクト。
 */
function LegacyNotePagesRedirect() {
  const { noteId, pageId } = useParams<{ noteId: string; pageId: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={`/notes/${noteId}/${pageId}${search}${hash}`} replace />;
}

/**
 * Layout route that renders the shared `AppLayout` (header + AI dock)
 * around nested route elements via `<Outlet />`.
 *
 * ネストしたルート要素を共通 `AppLayout`（ヘッダー・AI ドック）でラップするレイアウトルート。
 */
function AppShellRoute() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

/**
 * Root app component. Sets up providers and route tree.
 * ルートアプリコンポーネント。プロバイダーとルートを構成する。
 */
const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {/* unstable_useTransitions を無効化: リンク後の表示が遅れる問題を防ぐ（RR v7 は future 廃止）
            Disable unstable_useTransitions: prevents display delay after link navigation (RR v7 removed future flags) */}
        <BrowserRouter unstable_useTransitions={false}>
          <FilePreviewDialogHost />
          <AIChatProvider>
            <AIChatConversationsProvider>
              <GlobalShortcutsProvider>
                <GlobalSearchProvider>
                  <Routes>
                    {/* Public / chrome-less routes: LP, auth flows, invites, onboarding
                        ヘッダー非表示ルート: LP / 認証 / 招待 / オンボーディング */}
                    <Route path="/" element={<Landing />} />
                    <Route path="/sign-in/*" element={<SignIn />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/auth/extension" element={<ExtensionAuth />} />
                    <Route path="/auth/extension-callback" element={<ExtensionAuthCallback />} />
                    <Route path="/mcp/authorize" element={<McpAuthorize />} />
                    <Route path="/invite" element={<InvitePage />} />
                    <Route path="/invite-links/:token" element={<InviteLinkPage />} />
                    <Route
                      path="/onboarding"
                      element={
                        <ProtectedRoute>
                          <Onboarding />
                        </ProtectedRoute>
                      }
                    />

                    {/* App shell routes: wrapped with the shared AppLayout
                        so every page gets the common Header + primary nav + user menu + AI dock.
                        共通 AppLayout（ヘッダー + 機能ナビ + ユーザーメニュー + AI ドック）でラップ。 */}
                    <Route element={<AppShellRoute />}>
                      {/* Home and PageEditor: available without login (local-only mode) */}
                      <Route path="/home" element={<Home />} />
                      <Route path="/ai/history" element={<AIChatHistory />} />
                      <Route path="/ai/:conversationId" element={<AIChatDetail />} />
                      <Route path="/ai" element={<AIChatLanding />} />
                      <Route
                        path="/ai-chat/history"
                        element={<Navigate to="/ai/history" replace />}
                      />
                      <Route
                        path="/ai-chat/:conversationId"
                        element={<LegacyAIChatConversationRedirect />}
                      />
                      {/* Bare `/ai-chat` is also a legacy path: redirect to `/ai`
                          to avoid hitting the catch-all NotFound page.
                          素の `/ai-chat` も旧パスなので `/ai` にリダイレクトする
                          （catch-all で NotFound に落ちるのを防ぐ）。 */}
                      <Route path="/ai-chat" element={<Navigate to="/ai" replace />} />
                      <Route path="/search" element={<SearchResults />} />
                      <Route path="/notes/discover" element={<NotesDiscover />} />
                      <Route path="/notes" element={<Notes />} />
                      <Route path="/pages/:id" element={<PageEditorPage />} />
                      {/* Legacy singular path — redirect to plural.
                          旧単数形パス — 複数形にリダイレクト。 */}
                      <Route path="/page/:id" element={<LegacyPageRedirect />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/wiki-schema" element={<WikiSchemaPage />} />
                      <Route path="/index" element={<IndexPage />} />
                      <Route path="/pricing" element={<Pricing />} />
                      {/* Legacy /subscription path — the subscription management UI
                          now lives under the /pricing#manage section after the
                          pricing + subscription integration (issue #671).
                          旧 /subscription パス。Issue #671 の統合で契約管理 UI は
                          /pricing#manage セクションへ移動したためリダイレクトする。 */}
                      <Route
                        path="/subscription"
                        element={<Navigate to="/pricing#manage" replace />}
                      />
                      <Route path="/donate" element={<Donate />} />
                      <Route path="/notes/:noteId" element={<NoteView />} />
                      <Route path="/notes/:noteId/settings" element={<NoteSettings />} />
                      <Route path="/notes/:noteId/members" element={<NoteMembers />} />
                      <Route path="/notes/:noteId/:pageId" element={<NotePageView />} />
                      {/* Legacy path — redirect `/notes/:noteId/pages/:pageId` to
                          the shorter `/notes/:noteId/:pageId`.
                          旧パス `/notes/:noteId/pages/:pageId` を短縮形にリダイレクト。 */}
                      <Route
                        path="/notes/:noteId/pages/:pageId"
                        element={<LegacyNotePagesRedirect />}
                      />
                      {/* Legacy singular paths — redirect to plural.
                          旧単数形パス — 複数形にリダイレクト。 */}
                      <Route path="/note/:noteId" element={<LegacyNoteRedirect />} />
                      <Route
                        path="/note/:noteId/settings"
                        element={<LegacyNoteRedirect suffix="settings" />}
                      />
                      <Route
                        path="/note/:noteId/members"
                        element={<LegacyNoteRedirect suffix="members" />}
                      />
                      <Route
                        path="/note/:noteId/page/:pageId"
                        element={<LegacyNotePageRedirect />}
                      />
                    </Route>

                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </GlobalSearchProvider>
              </GlobalShortcutsProvider>
            </AIChatConversationsProvider>
          </AIChatProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
