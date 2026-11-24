import type { NoteRole } from "../../shared/types";

/** Time between permission checks. / アクセス権を再確認する間隔。 */
export const REAUTHORIZE_INTERVAL_MS = 30_000;

interface RoomConnection {
  id: string;
  userId: string | null;
  readOnly: boolean;
}

interface ReauthorizationPlan {
  close: string[];
  setReadOnly: { id: string; readOnly: boolean }[];
}

/**
 * Plans socket closures and write permission changes in connection order.
 * 切断する接続と書き込み権限を更新する接続を、入力の順に決める。
 */
export function planReauthorization(
  connections: readonly RoomConnection[],
  roles: ReadonlyMap<string, NoteRole>,
): ReauthorizationPlan {
  const plan: ReauthorizationPlan = { close: [], setReadOnly: [] };
  for (const { id, userId, readOnly } of connections) {
    const role = userId === null ? undefined : roles.get(userId);
    if (!role) {
      plan.close.push(id);
    } else {
      const nextReadOnly = role === "viewer";
      if (readOnly !== nextReadOnly) plan.setReadOnly.push({ id, readOnly: nextReadOnly });
    }
  }
  return plan;
}
