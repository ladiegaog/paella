import { Hono } from "hono";
import { clearAuthCookie, isAuthed, requireAuth, setAuthCookie, timingSafeEqual } from "./auth";
import {
  createPaella,
  deletePaella,
  exportAll,
  getPaella,
  listHashtags,
  listPaellas,
  updatePaella,
} from "./db";
import type { AppContext, AppEnv } from "./env";
import { MAX_IMAGE_BYTES } from "../public/js/comun/reglas.js";
import { buildMediaKey, extForContentType } from "./media";
import { rateLimit, requireCsrf } from "./middleware";
import { parseId, validatePaellaBody } from "./validate";
import type { PaellaBody } from "./validate";

// Todo lo que cuelga de /api. Se monta en index.ts.
export const api = new Hono<AppEnv>();

// ---------- auth ----------

// OJO: estos POST van a /api/* a propósito. En producción, Cloudflare Assets
// intercepta los POST a rutas que coinciden con un archivo estático
// (/entrar ↔ public/entrar.html) y devuelve 405 ANTES de llegar al worker. Las
// rutas /api/* no tienen asset homónimo, así que el worker siempre las maneja.
const aEntrarConAviso = (c: AppContext) => c.redirect("/entrar?e=espera");

api.post("/login", rateLimit("LOGIN_LIMITER", aEntrarConAviso), async (c) => {
  const form = await c.req.parseBody();
  const usuario = String(form.usuario || "").trim().toLowerCase();
  const pw = String(form.password || "");
  // Se comprueban SIEMPRE los dos con comparación en tiempo constante, y sin
  // cortocircuitar: así fallar el usuario y fallar la contraseña tardan lo
  // mismo y no se puede averiguar cuál de los dos falló.
  const okUsuario = timingSafeEqual(usuario, (c.env.USUARIO || "").toLowerCase());
  const okPass = !!c.env.PASSWORD && timingSafeEqual(pw, c.env.PASSWORD);
  if (!(okUsuario && okPass)) return c.redirect("/entrar?e=1");
  await setAuthCookie(c, c.env.AUTH_SECRET);
  return c.redirect("/");
});

api.post("/logout", (c) => {
  clearAuthCookie(c);
  return c.redirect("/");
});

api.get("/me", async (c) => c.json({ authed: await isAuthed(c) }));

// ---------- lecturas (públicas) ----------

api.get("/paellas", async (c) => {
  const limitRaw = parseInt(c.req.query("limit") || "12");
  const result = await listPaellas(c.env.DB, {
    cursor: c.req.query("cursor") || undefined,
    tag: c.req.query("tag") || undefined,
    limit: Number.isFinite(limitRaw) ? limitRaw : 12,
  });
  return c.json(result);
});

api.get("/paellas/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "id invalido" }, 400);
  const paella = await getPaella(c.env.DB, id);
  if (!paella) return c.json({ error: "no encontrada" }, 404);
  return c.json(paella);
});

api.get("/hashtags", async (c) => c.json(await listHashtags(c.env.DB)));

// ---------- escrituras (con login) ----------

const escritura = [requireAuth<Env>(), requireCsrf(), rateLimit("WRITE_LIMITER")] as const;

async function leerBody(req: Request): Promise<PaellaBody | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

api.post("/paellas", ...escritura, async (c) => {
  const body = await leerBody(c.req.raw);
  if (!body) return c.json({ error: "json invalido" }, 400);
  const v = validatePaellaBody(body, true);
  if (!v.ok) return c.json({ error: v.error }, 400);

  const id = await createPaella(c.env.DB, {
    titulo: v.titulo,
    descripcion: v.descripcion,
    r2_key: v.r2_key!,
    size: v.size,
    notas: v.notas,
    tags: v.tags,
    fotos: v.fotos ?? [],
  });
  return c.json(await getPaella(c.env.DB, id), 201);
});

api.patch("/paellas/:id", ...escritura, async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "id invalido" }, 400);
  const body = await leerBody(c.req.raw);
  if (!body) return c.json({ error: "json invalido" }, 400);
  const v = validatePaellaBody(body, false);
  if (!v.ok) return c.json({ error: v.error }, 400);

  const updated = await updatePaella(c.env.DB, id, {
    titulo: v.titulo,
    descripcion: v.descripcion,
    notas: v.notas,
    r2_key: v.r2_key,
    size: v.size,
    tags: v.tags,
    // Sólo se tocan las fotos si el body las trae; si no, se quedan como estaban.
    fotos: v.fotos,
  });
  if (!updated) return c.json({ error: "no encontrada" }, 404);
  return c.json(await getPaella(c.env.DB, id));
});

api.delete("/paellas/:id", requireAuth<Env>(), requireCsrf(), async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "id invalido" }, 400);
  if (!(await deletePaella(c.env.DB, id))) return c.json({ error: "no encontrada" }, 404);
  return c.json({ ok: true });
});

// Sube la foto ya comprimida en el navegador. El cuerpo es la imagen cruda (no
// multipart) y el tipo viaja en content-type: menos plumbing que un FormData y
// evita tener que parsear el multipart en el worker.
api.post("/upload", ...escritura, async (c) => {
  const ct = c.req.header("content-type") || "";
  const ext = extForContentType(ct);
  if (!ext) return c.json({ error: "tipo de imagen no permitido" }, 400);

  const declared = parseInt(c.req.header("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    return c.json({ error: "la foto es demasiado grande" }, 413);
  }
  const body = await c.req.arrayBuffer();
  if (body.byteLength > MAX_IMAGE_BYTES) {
    return c.json({ error: "la foto es demasiado grande" }, 413);
  }

  const key = buildMediaKey(ext);
  await c.env.STORAGE.put(key, body, { httpMetadata: { contentType: ct } });
  return c.json({ key, url: `/r2/${key}` });
});

api.get("/export", requireAuth<Env>(), async (c) => {
  const dump = await exportAll(c.env.DB);
  return new Response(JSON.stringify(dump, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="paellas-${new Date().toISOString().slice(0, 10)}.json"`,
      // Lleva también la papelera: que no se quede guardada en ninguna caché.
      "cache-control": "no-store",
    },
  });
});
