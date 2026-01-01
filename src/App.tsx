import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import PageEditorPage from "./pages/PageEditor";
import Settings from "./pages/Settings";
import AISettings from "./pages/AISettings";
import NotFound from "./pages/NotFound";
import { GlobalSearch } from "./components/search/GlobalSearch";
import { GlobalShortcutsProvider } from "./components/layout/GlobalShortcutsProvider";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <GlobalShortcutsProvider>
          <GlobalSearch />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/page/:id" element={<PageEditorPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/ai" element={<AISettings />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </GlobalShortcutsProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
