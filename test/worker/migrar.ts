import { applyD1Migrations, env } from "cloudflare:test";

// Cada archivo de tests arranca con una D1 vacía: se le aplican las mismas
// migraciones que a producción (las lee vitest.config.ts de migrations/).
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
