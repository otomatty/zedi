import { createTestIdp } from "./app";

/**
 * Bindings of the test IdP Worker (`wrangler.test-idp.jsonc`). The app reaches it only through
 * a service binding, plus the `/test-idp/authorize` page the app proxies.
 * テスト用 IdP の Worker のバインディング。アプリからはサービスバインディングでだけ呼ばれる。
 */
interface TestIdpEnv {
  TEST_IDP_SECRET: string;
  TEST_IDP_PASSWORD: string;
  /** Defaults to `test.zedi-note.app`. */
  TEST_IDP_EMAIL_DOMAIN?: string;
}

export default {
  fetch(request: Request, env: TestIdpEnv): Response | Promise<Response> {
    if (!env.TEST_IDP_SECRET || !env.TEST_IDP_PASSWORD) {
      return new Response("TEST_IDP_SECRET and TEST_IDP_PASSWORD must be set", { status: 500 });
    }
    return createTestIdp({
      secret: env.TEST_IDP_SECRET,
      password: env.TEST_IDP_PASSWORD,
      emailDomain: env.TEST_IDP_EMAIL_DOMAIN ?? "test.zedi-note.app",
      clientId: "zedi-app",
    }).fetch(request);
  },
} satisfies ExportedHandler<TestIdpEnv>;
