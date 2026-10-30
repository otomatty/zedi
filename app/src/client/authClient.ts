import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

/**
 * Better Auth client. Imported lazily (sign-in / sign-out only) so it stays out of the
 * initial bundle for signed-in users.
 * Better Auth クライアント。サインイン・サインアウト時だけ遅延読み込みする。
 */
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
