import { Outlet, Link } from "react-router-dom";

/**
 * 管理者レイアウト（サイドナビ + メイン）
 */
export default function Layout() {
  return (
    <div className="min-h-screen flex bg-slate-900 text-slate-100">
      <aside className="w-56 border-r border-slate-700 p-4">
        <nav className="space-y-1">
          <Link
            to="/ai-models"
            className="block rounded px-3 py-2 text-sm hover:bg-slate-800"
          >
            AI モデル
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
