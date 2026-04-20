import { useCallback, useEffect, useRef, useState } from "react";
import type { LintFindingItem, LintRule, LintRunSummaryItem } from "@/api/lint";
import { getLintFindings, runLint, resolveLintFinding } from "@/api/lint";
import { WikiHealthContent } from "./WikiHealthContent";

/**
 * 管理画面の「Wiki Health」ページ。
 * Lint を実行して結果を一覧表示する。
 *
 * Admin "Wiki Health" page.
 * Runs lint and displays findings in a table.
 */
export default function WikiHealth() {
  const [findings, setFindings] = useState<LintFindingItem[]>([]);
  const [summary, setSummary] = useState<LintRunSummaryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ruleFilter, setRuleFilter] = useState<LintRule | undefined>(undefined);

  const isMountedRef = useRef(true);
  // 連打や解決アクション直後の reload で複数の getLintFindings が同時に
  // 走ることがある。requestId を発行して最新の応答以外を破棄しないと
  // 古いリクエストの結果で findings が上書きされ、解決済み項目が再表示される。
  // Track in-flight request id so older getLintFindings responses cannot
  // overwrite a newer one (e.g. reload tapped twice or resolve+reload race).
  const requestIdRef = useRef(0);

  const loadFindings = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (isMountedRef.current) setLoading(true);
    if (isMountedRef.current) setError(null);
    try {
      const result = await getLintFindings();
      if (!isMountedRef.current || requestId !== requestIdRef.current) return;
      setFindings(result.findings);
    } catch (e) {
      if (!isMountedRef.current || requestId !== requestIdRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isMountedRef.current && requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadFindings();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadFindings]);

  const handleRunLint = useCallback(async () => {
    if (isMountedRef.current) setRunning(true);
    if (isMountedRef.current) setError(null);
    try {
      const result = await runLint();
      if (!isMountedRef.current) return;
      setSummary(result.summary);
      // findings を再取得 / Reload findings
      await loadFindings();
    } catch (e) {
      if (!isMountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isMountedRef.current) setRunning(false);
    }
  }, [loadFindings]);

  const handleResolve = useCallback(
    async (id: string) => {
      try {
        await resolveLintFinding(id);
        if (!isMountedRef.current) return;
        await loadFindings();
      } catch (e) {
        if (!isMountedRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [loadFindings],
  );

  return (
    <WikiHealthContent
      findings={findings}
      summary={summary}
      loading={loading}
      running={running}
      error={error}
      ruleFilter={ruleFilter}
      onRuleFilterChange={setRuleFilter}
      onRunLint={handleRunLint}
      onResolve={handleResolve}
    />
  );
}
