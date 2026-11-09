import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminGuard } from "./components/AdminGuard";
import Layout from "./pages/Layout";
import Login from "./pages/Login";
import AiModels from "./pages/ai-models";
import Users from "./pages/users";
import AuditLogs from "./pages/audit-logs";
import WikiHealth from "./pages/wiki-health";
import ActivityLog from "./pages/ActivityLog";
import Errors from "./pages/errors";

/**
 * Root component for the admin SPA: sets up routing and the admin auth guard.
 * 管理画面 SPA のルート。ルーティングと管理者向け認証ガードを構成する。
 */
function App() {
  return (
    // Match main app: disable useTransitions so navigation updates apply immediately (stable name since RR 7.18).
    // メインアプリと同様: useTransitions を無効化し遷移を即時反映（RR 7.18 で正式名に変更）。
    <BrowserRouter useTransitions={false}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <AdminGuard>
              <Layout />
            </AdminGuard>
          }
        >
          <Route index element={<Navigate to="/ai-models" replace />} />
          <Route path="ai-models" element={<AiModels />} />
          <Route path="users" element={<Users />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="wiki-health" element={<WikiHealth />} />
          <Route path="activity-log" element={<ActivityLog />} />
          <Route path="errors" element={<Errors />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
