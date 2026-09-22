import type { Next } from "hono";
import type { AppContext } from "./env";

// CSRF: las escrituras exigen un header custom que un <form> HTML no puede
// poner, así que un POST cross-site no llega a estos endpoints aunque el
// navegador mande la cookie.
export function requireCsrf() {
  return async (c: AppContext, next: Next) => {
    if (c.req.header("x-paella-csrf") !== "1") {
      return c.json({ error: "csrf" }, 403);
    }
    await next();
  };
}

// Rate limit por IP con uno de los limitadores de wrangler.toml. Fail-open a
// propósito (no bloqueamos a la diega porque el limitador tenga un mal día)
// pero logueado. `alLimite` cambia la respuesta cuando no es un fetch sino un
// formulario (el login), que con un JSON a pelo enseñaría una página en blanco.
export function rateLimit(
  binding: "WRITE_LIMITER" | "LOGIN_LIMITER",
  alLimite: (c: AppContext) => Response | Promise<Response> = (c) =>
    c.json({ error: "demasiadas peticiones, espera un momento" }, 429),
) {
  return async (c: AppContext, next: Next) => {
    try {
      const ip = c.req.header("cf-connecting-ip") || "local";
      const { success } = await c.env[binding].limit({ key: ip });
      if (!success) return alLimite(c);
    } catch (e) {
      console.error("rate limiter no disponible:", e);
    }
    await next();
  };
}

// Cabeceras de seguridad para las páginas. La CSP es estricta porque se puede:
// no hay ni un script ni un estilo inline, y todo (tipografía y códec WebP
// incluidos) se sirve desde aquí mismo.
//   - 'wasm-unsafe-eval' es lo que deja compilar el códec WebP; no habilita eval.
//   - blob: en img-src son las miniaturas locales de la galería antes de subir.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function securityHeaders() {
  return async (c: AppContext, next: Next) => {
    await next();
    if (!(c.res.headers.get("content-type") || "").includes("text/html")) return;
    c.header("content-security-policy", CSP);
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "strict-origin-when-cross-origin");
  };
}
