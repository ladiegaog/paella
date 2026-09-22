import { Hono } from "hono";
import type { Context, Next } from "hono";
import {
  clearAuthCookie,
  isAuthed,
  requireAuth,
  setAuthCookie,
  timingSafeEqual,
} from "./auth";
import {
  createPaella,
  deletePaella,
  exportAll,
  getPaella,
  listHashtags,
  listPaellas,
  updatePaella,
} from "./db";
import { extractHashtags, parseHashtagsField, setHashtags } from "./hashtags";
import { buildMediaKey, extForContentType, isSafeMediaKey, maxImageBytes } from "./media";

// ---------- config ----------

const TITULO_MAX_LEN = 120;
const DESCRIPCION_MAX_LEN = 2000;

// Parsea un :id de ruta a entero positivo estricto. null si no es válido.
function parseId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Binding de rate limiting nativo (wrangler.toml [[unsafe.bindings]]).
interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  ASSETS: Fetcher;
  // USUARIO va en [vars] de wrangler.toml (no es un secreto: es el nombre que
  // se teclea). La contraseña sí es secreto.
  USUARIO: string;
  PASSWORD: string;
  AUTH_SECRET: string;
  WRITE_LIMITER: RateLimit;
};

const app = new Hono<{ Bindings: Bindings }>();

app.onError((err, c) => {
  console.error("worker error:", err?.message, err?.stack);
  return c.json({ error: "internal" }, 500);
});

// CSRF: las escrituras exigen un header custom que un <form> HTML no puede
// poner, así que un POST cross-site no llega a estos endpoints aunque el
// navegador mande la cookie.
function requireCsrf() {
  return async (c: Context, next: Next) => {
    if (c.req.header("x-paella-csrf") !== "1") {
      return c.json({ error: "csrf" }, 403);
    }
    await next();
  };
}

// Rate limit por IP. Fail-open a propósito (no bloqueamos a la diega porque el
// limitador tenga un mal día) pero logueado.
function rateLimit() {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    try {
      const ip = c.req.header("cf-connecting-ip") || "local";
      const { success } = await c.env.WRITE_LIMITER.limit({ key: ip });
      if (!success) {
        return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
      }
    } catch (e) {
      console.error("rate limiter no disponible:", e);
    }
    await next();
  };
}

// ---------- auth ----------

// OJO: estos POST van a /api/* a propósito. En producción, Cloudflare Assets
// intercepta los POST a rutas que coinciden con un archivo estático
// (/entrar ↔ public/entrar.html) y devuelve 405 ANTES de llegar al worker. Las
// rutas /api/* no tienen asset homónimo, así que el worker siempre las maneja.
app.post("/api/login", async (c) => {
  const form = await c.req.parseBody();
  const usuario = ((form.usuario as string) || "").trim().toLowerCase();
  const pw = (form.password as string) || "";
  // Se comprueban SIEMPRE los dos con comparación en tiempo constante, y con &
  // en vez de && para no cortocircuitar: así fallar el usuario y fallar la
  // contraseña tardan lo mismo y no se puede averiguar cuál de los dos falló.
  const okUsuario = timingSafeEqual(usuario, (c.env.USUARIO || "").toLowerCase());
  const okPass = !!c.env.PASSWORD && timingSafeEqual(pw, c.env.PASSWORD);
  if (!(okUsuario && okPass)) return c.redirect("/entrar?e=1");
  await setAuthCookie(c, c.env.AUTH_SECRET);
  return c.redirect("/");
});

app.post("/api/logout", (c) => {
  clearAuthCookie(c);
  return c.redirect("/");
});

app.get("/api/me", async (c) =>
  c.json({ authed: await isAuthed(c), maxImageBytes }),
);

// ---------- API: lecturas (públicas) ----------

app.get("/api/paellas", async (c) => {
  const limitRaw = parseInt(c.req.query("limit") || "12");
  const result = await listPaellas(c.env.DB, {
    cursor: c.req.query("cursor") || undefined,
    tag: c.req.query("tag") || undefined,
    q: c.req.query("q") || undefined,
    limit: Number.isFinite(limitRaw) ? limitRaw : 12,
  });
  return c.json(result);
});

app.get("/api/paellas/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "id invalido" }, 400);
  const paella = await getPaella(c.env.DB, id);
  if (!paella) return c.json({ error: "no encontrada" }, 404);
  return c.json(paella);
});

app.get("/api/hashtags", async (c) => c.json(await listHashtags(c.env.DB)));

// ---------- API: escrituras (con login) ----------

type PaellaBody = {
  titulo?: string | null;
  descripcion?: string | null;
  hashtags?: string | null;
  r2_key?: string | null;
  size?: number | null;
};

type Validation =
  | { ok: false; error: string }
  | {
      ok: true;
      titulo: string;
      descripcion: string | null;
      tags: string[];
      r2_key: string | null;
      size: number | null;
    };

// Valida y sanea el body. Los tags salen del campo dedicado MÁS los #embebidos
// en título y descripción, para que escribir "#leña" en el texto también filtre.
// `requireFoto` distingue crear (la foto es obligatoria) de editar (opcional).
export function validatePaellaBody(body: PaellaBody, requireFoto: boolean): Validation {
  const titulo = String(body.titulo ?? "").trim().slice(0, TITULO_MAX_LEN);
  if (!titulo) return { ok: false, error: "la paella necesita un título" };

  const descripcion = String(body.descripcion ?? "").trim() || null;
  if (descripcion && descripcion.length > DESCRIPCION_MAX_LEN) {
    return { ok: false, error: "la descripción es demasiado larga" };
  }

  const rawKey = body.r2_key ? String(body.r2_key) : null;
  if (requireFoto && !rawKey) return { ok: false, error: "falta la foto" };
  if (rawKey && !isSafeMediaKey(rawKey)) return { ok: false, error: "foto inválida" };

  const sizeNum = Number(body.size);
  const size = Number.isSafeInteger(sizeNum) && sizeNum > 0 ? sizeNum : null;

  const tags = [
    ...new Set([
      ...parseHashtagsField(body.hashtags),
      ...extractHashtags(titulo),
      ...extractHashtags(descripcion),
    ]),
  ];

  return { ok: true, titulo, descripcion, tags, r2_key: rawKey, size };
}

app.post("/api/paellas", requireAuth(), requireCsrf(), rateLimit(), async (c) => {
  let body: PaellaBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "json invalido" }, 400);
  }
  const v = validatePaellaBody(body, true);
  if (!v.ok) return c.json({ error: v.error }, 400);

  const row = await createPaella(c.env.DB, {
    titulo: v.titulo,
    descripcion: v.descripcion,
    r2_key: v.r2_key!,
    size: v.size,
  });
  await setHashtags(c.env.DB, row.id, v.tags);
  return c.json(await getPaella(c.env.DB, row.id), 201);
});

app.patch("/api/paellas/:id", requireAuth(), requireCsrf(), rateLimit(), async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "id invalido" }, 400);
  let body: PaellaBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "json invalido" }, 400);
  }
  const v = validatePaellaBody(body, false);
  if (!v.ok) return c.json({ error: v.error }, 400);

  const updated = await updatePaella(c.env.DB, id, {
    titulo: v.titulo,
    descripcion: v.descripcion,
    r2_key: v.r2_key,
    size: v.size,
  });
  if (!updated) return c.json({ error: "no encontrada" }, 404);
  await setHashtags(c.env.DB, id, v.tags);
  return c.json(await getPaella(c.env.DB, id));
});

app.delete("/api/paellas/:id", requireAuth(), requireCsrf(), async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "id invalido" }, 400);
  if (!(await deletePaella(c.env.DB, id))) return c.json({ error: "no encontrada" }, 404);
  return c.json({ ok: true });
});

// Sube la foto ya comprimida en el navegador. El cuerpo es la imagen cruda (no
// multipart) y el tipo viaja en content-type: menos plumbing que un FormData y
// evita tener que parsear el multipart en el worker.
app.post("/api/upload", requireAuth(), requireCsrf(), rateLimit(), async (c) => {
  const ct = c.req.header("content-type") || "";
  const ext = extForContentType(ct);
  if (!ext) return c.json({ error: "tipo de imagen no permitido" }, 400);

  const declared = parseInt(c.req.header("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxImageBytes) {
    return c.json({ error: "la foto es demasiado grande" }, 413);
  }
  const body = await c.req.arrayBuffer();
  if (body.byteLength > maxImageBytes) {
    return c.json({ error: "la foto es demasiado grande" }, 413);
  }

  const key = buildMediaKey(ext);
  await c.env.STORAGE.put(key, body, { httpMetadata: { contentType: ct } });
  return c.json({ key, url: `/r2/${key}` });
});

app.get("/api/export", requireAuth(), async (c) => {
  const dump = await exportAll(c.env.DB);
  return new Response(JSON.stringify(dump, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="paellas-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});

// ---------- R2 (público) ----------

app.get("/r2/*", async (c) => {
  const key = c.req.path.replace(/^\/r2\//, "");
  if (!isSafeMediaKey(key)) return c.notFound();
  const obj = await c.env.STORAGE.get(key);
  if (!obj) return c.notFound();

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  // Las claves son inmutables (nombre aleatorio por subida), así que se pueden
  // cachear para siempre.
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
});

// ---------- páginas ----------

const page = (file: string) => (c: Context<{ Bindings: Bindings }>) =>
  c.env.ASSETS.fetch(new Request(new URL(file, c.req.url)));

app.get("/", page("/index.html"));
// GET /entrar sirve la página de login. Hace falta declararlo porque el POST de
// arriba registra la ruta /api/login y sin este GET la URL limpia /entrar
// acabaría en el catch-all sin extensión.
app.get("/entrar", page("/entrar.html"));
app.get("/subir", requireAuth(), page("/subir.html"));
app.get("/p/:id", page("/paella.html"));

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
