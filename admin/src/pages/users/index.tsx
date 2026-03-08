import { useCallback, useEffect, useRef, useState } from "react";
import type { UserAdmin, UserRole } from "@/api/admin";
import { getUsers, patchUserRole } from "@/api/admin";
import { UsersContent } from "./UsersContent";

const SEARCH_DEBOUNCE_MS = 300;

export default function Users() {
  const [users, setUsers] = useState<UserAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (showLoading = true) => {
      if (showLoading && isMountedRef.current) setLoading(true);
      if (isMountedRef.current) setError(null);
      try {
        const result = await getUsers({
          search: search || undefined,
          limit: 50,
          offset: 0,
        });
        if (!isMountedRef.current) return;
        setUsers(result.users);
        setTotal(result.total);
        setError(null);
      } catch (e) {
        if (!isMountedRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    isMountedRef.current = true;
    void load();
    return () => {
      isMountedRef.current = false;
    };
  }, [load]);

  // 検索入力のデバウンス
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchTimerRef.current = null;
      setSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchInput]);

  const handleRoleChange = useCallback(async (user: UserAdmin, role: UserRole) => {
    if (user.role === role) return;
    setSavingId(user.id);
    setError(null);
    try {
      const { user: updated } = await patchUserRole(user.id, role);
      if (!isMountedRef.current) return;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    } catch (e) {
      if (!isMountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isMountedRef.current) setSavingId(null);
    }
  }, []);

  return (
    <UsersContent
      users={users}
      total={total}
      search={searchInput}
      onSearchChange={setSearchInput}
      error={error}
      loading={loading}
      savingId={savingId}
      onRoleChange={handleRoleChange}
    />
  );
}
