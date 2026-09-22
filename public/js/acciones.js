// ----- lo que se hace con una paella desde más de un sitio -----
//
// Borrar se puede desde la lista y desde la ficha; subir una imagen, para la
// cenital y para cada foto de la galería; los hashtags los quieren a la vez la
// barra de filtros y las sugerencias del formulario. Una sola versión de cada.

import { api } from './api.js';
import { toast } from './utils.js';
import { MAX_IMAGE_BYTES } from './comun/reglas.js';

// Pide confirmación y borra (a la papelera). true si se borró.
export async function borrarPaella(paella) {
  if (!confirm(`¿borrar "${paella.titulo}"?`)) return false;
  const { ok } = await api(`/api/paellas/${paella.id}`, { method: 'DELETE' });
  if (!ok) {
    toast('no se pudo borrar', 'error');
    return false;
  }
  return true;
}

// Sube una imagen ya comprimida y devuelve su clave de R2. Lanza con un mensaje
// que se puede enseñar tal cual.
export async function subirImagen(blob) {
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('la foto comprimida sigue siendo demasiado grande');
  const { ok, data } = await api('/api/upload', {
    method: 'POST',
    body: blob,
    headers: { 'content-type': blob.type },
  });
  if (!ok) throw new Error(data?.error || 'no se pudo subir la foto');
  return data.key;
}

// Los hashtags con su cuenta. Quien llame a la vez comparte la misma petición;
// `fresca` la repite (después de publicar o borrar, que cambian las cuentas).
let hashtags = null;
export function pedirHashtags({ fresca = false } = {}) {
  if (!hashtags || fresca) {
    hashtags = api('/api/hashtags').then(({ ok, data }) => (ok && Array.isArray(data) ? data : []));
  }
  return hashtags;
}
