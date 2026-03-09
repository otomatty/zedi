import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminGuard } from "./components/AdminGuard";
import Layout from "./pages/Layout";
import Login from "./pages/Login";
import AiModels from "./pages/ai-models";
import Users from "./pages/users";

function App() {
  return (
    <BrowserRouter>
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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
