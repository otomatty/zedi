import { Toaster } from "@zedi/ui";
import { Toaster as Sonner } from "@zedi/ui/components/sonner";
import { TooltipProvider } from "@zedi/ui";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Home from "./pages/Home";
import Notes from "./pages/Notes";
import NotesDiscover from "./pages/NotesDiscover";
import SignIn from "./pages/SignIn";
import AuthCallback from "./pages/AuthCallback";
import PageEditorPage from "./pages/PageEditor";
import Settings from "./pages/Settings";
import AISettings from "./pages/AISettings";
import StorageSettings from "./pages/StorageSettings";
import GeneralSettings from "./pages/GeneralSettings";
import Pricing from "./pages/Pricing";
import SubscriptionManagement from "./pages/SubscriptionManagement";
import Donate from "./pages/Donate";
import SearchResults from "./pages/SearchResults";
import NotFound from "./pages/NotFound";
import NoteView from "./pages/NoteView";
import NotePageView from "./pages/NotePageView";
import NoteSettings from "./pages/NoteSettings.tsx";
import NoteMembers from "./pages/NoteMembers.tsx";
import Onboarding from "./pages/Onboarding";
import { GlobalSearchProvider } from "./contexts/GlobalSearchContext";
import { GlobalShortcutsProvider } from "./components/layout/GlobalShortcutsProvider";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AIChatProvider } from "./contexts/AIChatContext";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {/* v7_startTransition を無効化: リンククリック後のページ切り替えで表示が即時更新されない問題を防ぐ */}
        <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
          <AIChatProvider>
            <GlobalShortcutsProvider>
              <GlobalSearchProvider>
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<Landing />} />
                  <Route path="/sign-in/*" element={<SignIn />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
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
                  <Route path="/search" element={<SearchResults />} />
                  <Route path="/notes/discover" element={<NotesDiscover />} />
                  <Route path="/notes" element={<Notes />} />
                  <Route path="/page/:id" element={<PageEditorPage />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/settings/ai" element={<AISettings />} />
                  <Route path="/settings/storage" element={<StorageSettings />} />
                  <Route path="/settings/general" element={<GeneralSettings />} />
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
          </AIChatProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
