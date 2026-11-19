/** Steps of a sign-out, injected so the order and the failure handling can be tested. */
export interface SignOutDeps {
  /** Ends the session on the server; Better Auth resolves `{ error }` instead of throwing. */
  endServerSession: () => Promise<{ error?: unknown } | null | undefined>;
  clearOfflineData: () => Promise<void>;
  clearQueries: () => void;
  endLocalSession: () => void;
}

/**
 * Signs out: ends the server session, and only once that succeeded clears what this device
 * keeps and shows the signed-out state. Returns false (and changes nothing locally) when the
 * server refused or could not be reached, so the UI does not pretend the session has ended.
 * サインアウト。サーバーのセッション終了が成功してから端末のデータを消して表示を切り替える。
 * 失敗したら何も変えずに false を返す。
 */
export async function signOut(deps: SignOutDeps): Promise<boolean> {
  try {
    const result = await deps.endServerSession();
    if (result?.error) return false;
  } catch {
    return false;
  }
  await deps.clearOfflineData();
  deps.clearQueries();
  deps.endLocalSession();
  return true;
}
