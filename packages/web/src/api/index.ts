import type { RouterClient } from "@orpc/server";
import './environment';
import { createApp } from "./__core/app";
import { ping } from "./routes/ping";
import { workspace } from './routes/workspace';
import { review } from './routes/review';
import { media } from './routes/media';
import { production } from './routes/production';
import { intake } from './routes/intake';
import { transfers } from './routes/transfers';
import { intelligence } from './routes/intelligence';
import { auth } from './auth';
import { mediaResponse,backupResponse } from './lib/streams';

// API features are oRPC procedures, one file per feature in ./routes/,
// composed into this router — typed end-to-end via the clients
// (web: src/web/lib/api.ts, mobile: lib/api.ts).
// Keep each routes/ file under 500 lines (`bun run lint` enforces this);
// split into more feature files as they grow.
// Patterns and examples: skills/app/references/api.md
export const router = {
  ping,
  workspace, review, media, production, intake, transfers, intelligence,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);
app.on(['GET','POST'],'/api/auth/*',c=>auth.handler(c.req.raw));
app.get('/api/media/:id',c=>mediaResponse(c.req.raw,c.req.param('id')));
app.get('/api/backup',c=>backupResponse(c.req.raw));
// Rare plain-HTTP endpoints (webhooks, streaming, the Better Auth handler)
// register here with full paths, e.g. app.post("/api/webhooks/example", ...)

export default app;
