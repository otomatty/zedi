import type { D1Migration } from "cloudflare:test";
import type { Env as WorkerEnv } from "../env";

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      /** Set only by vitest.config.worker.ts. */
      TEST_MIGRATIONS?: D1Migration[];
    }
  }
}
