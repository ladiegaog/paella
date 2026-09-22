// ----- wrapper único de fetch -----
//
// Centraliza cookie + CSRF + JSON + manejo de errores. Devuelve SIEMPRE
// { ok, status, data } y nunca lanza: un fallo de red se ve como
// { ok: false, status: 0 }, así que quien llama no tiene que distinguir entre
// "el servidor dijo que no" y "no se pudo enviar" — los dos acaban en un toast.

import { CSRF_HEADERS } from './state.js';

const RAW_BODY_TYPES = [Blob, ArrayBuffer, FormData];

function isRawBody(body) {
  if (body == null) return false;
  if (typeof body === 'string') return true;
  return RAW_BODY_TYPES.some((T) => body instanceof T);
}

export async function api(path, opts = {}) {
  const method = opts.method || 'GET';
  const isMutating = method !== 'GET' && method !== 'HEAD';
  const body = opts.body;
  const sendJson = body !== undefined && body !== null && !isRawBody(body);

  const headers = {
    ...(isMutating ? CSRF_HEADERS : {}),
    ...(sendJson ? { 'content-type': 'application/json' } : {}),
    ...opts.headers,
  };

  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body: sendJson ? JSON.stringify(body) : body,
      signal: opts.signal,
    });
  } catch (_) {
    return { ok: false, status: 0, data: null };
  }

  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}
