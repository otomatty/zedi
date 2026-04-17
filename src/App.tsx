import { Toaster } from "@zedi/ui";
import { Toaster as Sonner } from "@zedi/ui/components/sonner";
import { TooltipProvider } from "@zedi/ui";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
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
import SubscriptionManagement from "./pages/SubscriptionManagement";
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
import { GlobalSearchProvider } from "./contexts/GlobalSearchContext";
import { GlobalShortcutsProvider } from "./components/layout/GlobalShortcutsProvider";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AIChatProvider } from "./contexts/AIChatContext";
import { AIChatConversationsProvider } from "./hooks/useAIChatConversations";
import { FilePreviewDialogHost } from "./components/note/FilePreviewDialogHost";

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
                    {/* Public routes */}
                    <Route path="/" element={<Landing />} />
                    <Route path="/sign-in/*" element={<SignIn />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/auth/extension" element={<ExtensionAuth />} />
                    <Route path="/auth/extension-callback" element={<ExtensionAuthCallback />} />
                    <Route path="/mcp/authorize" element={<McpAuthorize />} />
                    <Route path="/invite" element={<InvitePage />} />
                    <Route path="/note/:noteId" element={<NoteView />} />
                    <Route path="/note/:noteId/settings" element={<NoteSettings />} />
                    <Route path="/note/:noteId/members" element={<NoteMembers />} />
                    <Route path="/note/:noteId/page/:pageId" element={<NotePageView />} />

                    {/* Protected routes - require authentication */}
                    <Route
                      path="/onboarding"
                      element={
                        <ProtectedRoute>
                          <Onboarding />
                        </ProtectedRoute>
                      }
                    />
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
                    <Route path="/search" element={<SearchResults />} />
                    <Route path="/notes/discover" element={<NotesDiscover />} />
                    <Route path="/notes" element={<Notes />} />
                    <Route path="/page/:id" element={<PageEditorPage />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/wiki-schema" element={<WikiSchemaPage />} />
                    <Route path="/index" element={<IndexPage />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route
                      path="/subscription"
                      element={
                        <ProtectedRoute>
                          <SubscriptionManagement />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/donate" element={<Donate />} />
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
