/**
 * Cognito sub → users.id 解決
 *
 * 旧 zedi-auth-db パッケージのインライン実装。
 * RDS Data API 経由で users テーブルから cognito_sub で検索し、users.id を返す。
 */
import type { EnvConfig } from '../types/index.js';

type ExecuteFn = (
  sql: string,
  params: Record<string, unknown>,
  env?: EnvConfig
) => Promise<Array<Record<string, unknown>>>;

/**
 * Cognito sub を users.id (UUID) に解決する。
 * ユーザーが見つからない場合は null を返す。
 */
export async function resolveUserId(
  cognitoSub: string,
  executeFn: ExecuteFn
): Promise<string | null> {
  const rows = await executeFn(
    'SELECT id FROM users WHERE cognito_sub = :cognito_sub LIMIT 1',
    { cognito_sub: cognitoSub }
  );
  if (rows.length === 0) return null;
  return (rows[0] as { id: string }).id;
}
