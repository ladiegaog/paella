import type { Context } from "hono";

// `Env` lo genera `npm run types` (wrangler types) a partir de wrangler.toml y
// de .dev.vars, en worker-configuration.d.ts. Al añadir un binding o un secreto
// hay que volver a generarlo; no se escribe a mano.
export type AppEnv = { Bindings: Env };
export type AppContext = Context<AppEnv>;
