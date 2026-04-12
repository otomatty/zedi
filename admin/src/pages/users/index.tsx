import { useCallback, useEffect, useRef, useState } from "react";
import type { UserAdmin, UserRole, UserStatus } from "@/api/admin";
import { getUsers, patchUserRole, suspendUser, unsuspendUser } from "@/api/admin";
import { UsersContent } from "./UsersContent";

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

/**
 *
 */
export default function Users() {
  /**
   *
   */
  const [users, setUsers] = useState<UserAdmin[]>([]);
  /**
   *
   */
  const [total, setTotal] = useState(0);
  /**
   *
   */
  const [loading, setLoading] = useState(true);
  /**
   *
   */
  const [error, setError] = useState<string | null>(null);
  /**
   *
   */
  const [search, setSearch] = useState("");
  /**
   *
   */
  const [searchInput, setSearchInput] = useState("");
  /**
   *
   */
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  /**
   *
   */
  const [page, setPage] = useState(0);
  /**
   *
   */
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  /**
   *
   */
  const isMountedRef = useRef(true);
  /**
   *
   */
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   *
   */
  const latestRequestRef = useRef(0);
  /**
   *
   */
  const pageRef = useRef(page);
  /**
   *
   */
  const searchRef = useRef(search);
  /**
   *
   */
  const statusFilterRef = useRef(statusFilter);
  pageRef.current = page;
  searchRef.current = search;
  statusFilterRef.current = statusFilter;

  /**
   *
   */
  const load = useCallback(
    async (showLoading = true) => {
      /**
       *
       */
      const requestId = ++latestRequestRef.current;
      if (showLoading && isMountedRef.current) setLoading(true);
      if (isMountedRef.current) setError(null);
      try {
        /**
         *
         */
        const result = await getUsers({
          search: searchRef.current || undefined,
          status: statusFilterRef.current === "all" ? undefined : statusFilterRef.current,
          limit: PAGE_SIZE,
          offset: pageRef.current * PAGE_SIZE,
        });
        if (!isMountedRef.current || requestId !== latestRequestRef.current) return;
        setUsers(result.users);
        setTotal(result.total);
        setError(null);
      } catch (e) {
        if (!isMountedRef.current || requestId !== latestRequestRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (isMountedRef.current && requestId === latestRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [page, search, statusFilter],
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
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchInput]);

  /**
   *
   */
  const handleRoleChange = useCallback(
    async (user: UserAdmin, role: UserRole) => {
      if (user.role === role) return;
      setSavingIds((prev) => new Set(prev).add(user.id));
      setError(null);
      try {
        await patchUserRole(user.id, role);
        if (!isMountedRef.current) return;
        latestRequestRef.current += 1;
        await load(false);
      } catch (e) {
        if (!isMountedRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (isMountedRef.current) {
          setSavingIds((prev) => {
            /**
             *
             */
            const next = new Set(prev);
            next.delete(user.id);
            return next;
          });
        }
      }
    },
    [load],
  );

  /**
   *
   */
  const handleSuspend = useCallback(
    async (user: UserAdmin, reason?: string) => {
      setSavingIds((prev) => new Set(prev).add(user.id));
      setError(null);
      try {
        await suspendUser(user.id, reason);
        if (!isMountedRef.current) return;
        latestRequestRef.current += 1;
        await load(false);
      } catch (e) {
        if (!isMountedRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (isMountedRef.current) {
          setSavingIds((prev) => {
            /**
             *
             */
            const next = new Set(prev);
            next.delete(user.id);
            return next;
          });
        }
      }
    },
    [load],
  );

  /**
   *
   */
  const handleUnsuspend = useCallback(
    async (user: UserAdmin) => {
      setSavingIds((prev) => new Set(prev).add(user.id));
      setError(null);
      try {
        await unsuspendUser(user.id);
        if (!isMountedRef.current) return;
        latestRequestRef.current += 1;
        await load(false);
      } catch (e) {
        if (!isMountedRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (isMountedRef.current) {
          setSavingIds((prev) => {
            /**
             *
             */
            const next = new Set(prev);
            next.delete(user.id);
            return next;
          });
        }
      }
    },
    [load],
  );

  /**
   *
   */
  const handleStatusFilterChange = useCallback((value: UserStatus | "all") => {
    setStatusFilter(value);
    setPage(0);
  }, []);

  return (
    <UsersContent
      users={users}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      search={searchInput}
      statusFilter={statusFilter}
      onSearchChange={setSearchInput}
      onStatusFilterChange={handleStatusFilterChange}
      onPageChange={setPage}
      error={error}
      loading={loading}
      savingIds={savingIds}
      onRoleChange={handleRoleChange}
      onSuspend={handleSuspend}
      onUnsuspend={handleUnsuspend}
    />
  );
}
