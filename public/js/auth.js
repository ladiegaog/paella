// ----- comprobación de sesión + visibilidad anon/logueada -----

import { $$ } from './utils.js';
import { LIMITS } from './state.js';
import { api } from './api.js';

let IS_AUTHED = false;
export const isAuthed = () => IS_AUTHED;

export async function checkAuth() {
  const { ok, data } = await api('/api/me');
  IS_AUTHED = ok && !!data?.authed;
  if (data?.maxImageBytes) LIMITS.image = data.maxImageBytes;
  applyAuthVisibility();
  return IS_AUTHED;
}

// Los elementos con [data-authed-only] sólo se ven con sesión; los de
// [data-anon-only] sólo sin ella. Se llama tras checkAuth().
export function applyAuthVisibility() {
  for (const node of $$('[data-authed-only]')) node.hidden = !IS_AUTHED;
  for (const node of $$('[data-anon-only]')) node.hidden = IS_AUTHED;
  document.body.classList.toggle('is-authed', IS_AUTHED);
  document.body.classList.toggle('is-anon', !IS_AUTHED);
}
