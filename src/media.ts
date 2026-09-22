function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function randomKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Clave de R2 con la fecha dentro (fotos/25/09/ab12….webp): agrupa por mes y
// evita colisiones sin tener que consultar el bucket.
export function buildMediaKey(ext: string): string {
  const d = new Date();
  const yy = pad2(d.getFullYear() % 100);
  const mm = pad2(d.getMonth() + 1);
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `fotos/${yy}/${mm}/${randomKey()}.${safeExt}`;
}

const ALLOWED_IMAGE: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
};

// Devuelve la extensión para un content-type permitido, o null si no lo está.
export function extForContentType(ct: string): string | null {
  return ALLOWED_IMAGE[ct.split(";")[0].trim().toLowerCase()] ?? null;
}

// Una clave de R2 válida para servir: sin "..", sin barra inicial, y dentro de
// los prefijos que este worker escribe. Evita que un r2_key manipulado en el
// body de un POST apunte a cualquier objeto del bucket.
export function isSafeMediaKey(key: string): boolean {
  return /^fotos\/\d{2}\/\d{2}\/[0-9a-f]{24}\.[a-z0-9]{2,5}$/.test(key);
}
