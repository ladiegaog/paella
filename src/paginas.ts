import { Hono } from "hono";
import { formatNota, media, veredicto } from "../public/js/comun/notas.js";
import { requireAuth } from "./auth";
import { getPaella } from "./db";
import type { Paella } from "./db";
import type { AppContext, AppEnv } from "./env";
import { isSafeMediaKey } from "./media";
import { parseId } from "./validate";

// Lo que no es /api: las páginas, las fotos de R2 y el service worker.
export const paginas = new Hono<AppEnv>();

const asset = (c: AppContext, file: string) =>
  c.env.ASSETS.fetch(new Request(new URL(file, c.req.url)));

paginas.get("/", (c) => asset(c, "/index.html"));
// GET /entrar sirve la página de login. Hace falta declararlo porque el POST
// del login va a /api/login y sin este GET la URL limpia /entrar acabaría en
// el catch-all sin extensión.
paginas.get("/entrar", (c) => asset(c, "/entrar.html"));
paginas.get("/subir", requireAuth<Env>(), (c) => asset(c, "/subir.html"));

// ---------- la ficha, con su vista previa para compartir ----------
//
// Al pegar el enlace de una paella en WhatsApp o Telegram, la vista previa sale
// de las etiquetas og:* del HTML, y esos robots no ejecutan JavaScript. Así que
// el Worker las rellena aquí, con el título, la cenital y el veredicto, antes
// de servir la página. Se hace con setAttribute/setInnerContent, que escapan
// solos: un título con comillas no puede romper el HTML.

function resumen(p: Paella): string {
  const nota = media(p as unknown as Record<string, unknown>);
  const partes = [];
  if (nota !== null) partes.push(`${formatNota(nota)}/10 · ${veredicto(nota)}`);
  if (p.descripcion) {
    const d = p.descripcion.replace(/\s+/g, " ").trim();
    partes.push(d.length > 160 ? `${d.slice(0, 157)}…` : d);
  }
  return partes.join(" — ") || "Una de las paellas de la diega.";
}

paginas.get("/p/:id", async (c) => {
  const res = await asset(c, "/paella.html");
  const id = parseId(c.req.param("id"));
  const p = id === null ? null : await getPaella(c.env.DB, id);
  if (!p) {
    // El HTML se sirve igual (es el que dice "esta paella ya no está"), pero
    // con un 404 para que ni buscadores ni vistas previas la den por buena.
    return new Response(res.body, { status: 404, headers: res.headers });
  }

  const url = new URL(c.req.url);
  const titulo = `${p.titulo} — paellas.party`;
  const og: Record<string, string> = {
    "og:title": p.titulo,
    "og:description": resumen(p),
    "og:url": `${url.origin}/p/${p.id}`,
    "og:image": `${url.origin}/r2/${p.r2_key}`,
    "og:image:width": String(p.size || 1200),
    "og:image:height": String(p.size || 1200),
    "og:image:alt": `paella: ${p.titulo}`,
  };
  const setContent = (content: string) => ({
    element: (e: Element) => { e.setAttribute("content", content); },
  });

  let rw = new HTMLRewriter()
    .on("title", { element: (e) => { e.setInnerContent(titulo); } })
    .on('meta[name="description"]', setContent(og["og:description"]));
  for (const [prop, content] of Object.entries(og)) {
    rw = rw.on(`meta[property="${prop}"]`, setContent(content));
  }
  return rw.transform(res);
});

// ---------- el service worker ----------
//
// Se sirve con el id del despliegue dentro. El navegador compara sw.js byte a
// byte para saber si hay versión nueva, así que cada deploy instala un service
// worker nuevo que tira las cachés viejas: no hay que acordarse de subir nada.
paginas.get("/sw.js", async (c) => {
  const res = await asset(c, "/sw.js");
  const version = c.env.CF_VERSION_METADATA?.id || "dev";
  const js = (await res.text()).replace("'__VERSION__'", JSON.stringify(version));
  return new Response(js, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      // Que el navegador pregunte siempre: si cachease sw.js, las versiones
      // nuevas tardarían en llegar.
      "cache-control": "no-cache",
    },
  });
});

// ---------- R2 (público) ----------

paginas.get("/r2/*", async (c) => {
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

paginas.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
