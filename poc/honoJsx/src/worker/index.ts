import { routePartykitRequest } from "partyserver";
import { createApp, type Env } from "./app";
import { createNoteStore } from "./fakeNotes";

export { PageRoom } from "./pageRoom";

const app = createApp({
  notes: createNoteStore({ count: 10_000, seed: 1 }),
  routeRealtime: (request, env) => routePartykitRequest(request, env as unknown as Cloudflare.Env),
});

export default app satisfies ExportedHandler<Env>;
