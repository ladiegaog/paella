import {
  DESCRIPCION_MAX_LEN,
  MAX_FOTOS,
  TITULO_MAX_LEN,
} from "../public/js/comun/reglas.js";
import { CRITERIOS } from "../public/js/comun/notas.js";
import { extractHashtags, parseHashtagsField } from "../public/js/comun/tags.js";
import type { FotoNueva, Notas } from "./db";
import { isSafeMediaKey } from "./media";

// Parsea un :id de ruta a entero positivo estricto. null si no es válido.
export function parseId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

type FotoEntrada = { r2_key?: string | null; width?: number | null; height?: number | null };

export type PaellaBody = {
  titulo?: string | null;
  descripcion?: string | null;
  hashtags?: string | null;
  r2_key?: string | null;
  size?: number | null;
  notas?: Record<string, unknown> | null;
  fotos?: FotoEntrada[] | null;
};

export type Validation =
  | { ok: false; error: string }
  | {
      ok: true;
      titulo: string;
      descripcion: string | null;
      tags: string[];
      r2_key: string | null;
      size: number | null;
      notas: Notas;
      // null = el body no traía `fotos`, así que la galería se deja como está
      // (al editar sólo el título no hace falta reenviar las fotos). Un array
      // vacío sí es "quítalas todas".
      fotos: FotoNueva[] | null;
    };

// Una nota válida es un entero de 0 a 10, o nada (sin puntuar). Cualquier otra
// cosa —un 11, un decimal, un texto— se rechaza en vez de recortarse en
// silencio: si el cliente manda basura es un fallo, no una preferencia.
function parseNota(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 10) return undefined; // inválida
  return n;
}

const enteroPositivo = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
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

  const notas = {} as Notas;
  for (const { clave } of CRITERIOS) {
    const nota = parseNota(body.notas?.[clave]);
    if (nota === undefined) {
      return { ok: false, error: `la nota de ${clave} tiene que ser del 0 al 10` };
    }
    notas[clave] = nota;
  }

  let fotos: FotoNueva[] | null = null;
  if (Array.isArray(body.fotos)) {
    if (body.fotos.length > MAX_FOTOS) {
      return { ok: false, error: `como mucho ${MAX_FOTOS} fotos en la galería` };
    }
    fotos = [];
    for (const f of body.fotos) {
      const key = f?.r2_key ? String(f.r2_key) : "";
      if (!isSafeMediaKey(key)) return { ok: false, error: "foto de galería inválida" };
      fotos.push({ r2_key: key, width: enteroPositivo(f?.width), height: enteroPositivo(f?.height) });
    }
  }

  const tags = [
    ...new Set([
      ...parseHashtagsField(body.hashtags),
      ...extractHashtags(titulo),
      ...extractHashtags(descripcion),
    ]),
  ];

  return {
    ok: true,
    titulo,
    descripcion,
    tags,
    r2_key: rawKey,
    size: enteroPositivo(body.size),
    notas,
    fotos,
  };
}
