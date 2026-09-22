import { Hono } from "hono";
import { api } from "./api";
import type { AppEnv } from "./env";
import { securityHeaders } from "./middleware";
import { paginas } from "./paginas";

// Un único Worker para todo: la API (api.ts) y lo demás —páginas, fotos de R2 y
// service worker— (paginas.ts).
const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error("worker error:", err?.message, err?.stack);
  return c.json({ error: "internal" }, 500);
});

app.use("*", securityHeaders());
app.route("/api", api);
app.route("/", paginas);

export default app;
