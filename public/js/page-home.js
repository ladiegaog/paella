// ----- la portada: el bloque de subir, los hashtags y la lista -----

import { $, el, toast } from './utils.js';
import { api } from './api.js';
import { checkAuth, isAuthed } from './auth.js';
import { createFeed } from './feed.js';
import { mountComposer } from './composer.js';

const tagbar = $('#tagbar');

// El filtro vive en la URL (?tag=arroz) y no en una variable: así el enlace se
// puede compartir, el botón "atrás" funciona y recargar no lo pierde.
const tagDeLaUrl = () => new URLSearchParams(location.search).get('tag');

const feed = createFeed({
  container: $('#feed'),
  sentinel: $('#centinela'),
  cardOpts: () => ({
    authed: isAuthed(),
    onTag: (tag) => aplicarFiltro(tag, { push: true }),
    onBorrar: borrarPaella,
  }),
});

function aplicarFiltro(tag, { push = false } = {}) {
  // Volver a pulsar el hashtag activo quita el filtro.
  const siguiente = tag && tag === feed.tag ? null : tag || null;
  if (push) {
    history.pushState({ tag: siguiente }, '', siguiente ? `/?tag=${encodeURIComponent(siguiente)}` : '/');
  }
  feed.setFilter(siguiente);
  pintarEstadoFiltro(siguiente);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function pintarEstadoFiltro(tag) {
  for (const btn of tagbar.querySelectorAll('button')) {
    const activo = btn.dataset.tag === tag;
    btn.classList.toggle('activo', activo);
    btn.setAttribute('aria-pressed', String(activo));
  }
}

async function cargarHashtags() {
  const { ok, data } = await api('/api/hashtags');
  if (!ok || !Array.isArray(data)) return;
  tagbar.replaceChildren();
  for (const { tag, count } of data) {
    const btn = el('button', { class: 'tag', attrs: { type: 'button', 'aria-pressed': 'false' } });
    btn.dataset.tag = tag;
    btn.append(el('span', { text: `#${tag}` }), el('span', { class: 'tag-num', text: String(count) }));
    btn.addEventListener('click', () => aplicarFiltro(tag, { push: true }));
    tagbar.append(btn);
  }
  pintarEstadoFiltro(feed.tag);
}

async function borrarPaella(paella, card) {
  if (!confirm(`¿borrar "${paella.titulo}"?`)) return;
  const { ok } = await api(`/api/paellas/${paella.id}`, { method: 'DELETE' });
  if (!ok) return toast('no se pudo borrar', 'error');
  card.remove();
  toast('paella borrada');
  cargarHashtags();
}

// El botón "atrás" devuelve al filtro anterior sin recargar la página.
window.addEventListener('popstate', () => {
  const tag = tagDeLaUrl();
  feed.setFilter(tag);
  pintarEstadoFiltro(tag);
});

(async () => {
  await checkAuth();
  if (isAuthed()) {
    mountComposer({
      root: $('#composer'),
      // Tras publicar, recargamos la lista desde arriba para que la paella
      // nueva aparezca en su sitio sin tener que refrescar la página.
      onGuardada: () => { aplicarFiltro(null); cargarHashtags(); },
    });
  }
  const inicial = tagDeLaUrl();
  feed.start(inicial);
  cargarHashtags();
})();
