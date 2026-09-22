// ----- la portada: el bloque de subir, los hashtags y la lista -----

import { $, el, toast } from './utils.js';
import { checkAuth, isAuthed } from './auth.js';
import { borrarPaella, pedirHashtags } from './acciones.js';
import { createFeed } from './feed.js';
import { mountComposer } from './composer.js';

const tagbar = $('#tagbar');

// El filtro vive en la URL (?tag=arroz) y no en una variable: así el enlace se
// puede compartir, el botón "atrás" funciona y recargar no lo pierde.
const tagDeLaUrl = () => new URLSearchParams(location.search).get('tag');

// Se pregunta por la sesión a la vez que se piden las paellas, no antes: son
// independientes, y en serie cada carga esperaba un viaje de ida y vuelta de
// más. Las tarjetas esperan a saberlo porque con sesión llevan editar y borrar.
const sesion = checkAuth();

const feed = createFeed({
  container: $('#feed'),
  sentinel: $('#centinela'),
  antesDePintar: sesion,
  cardOpts: () => ({
    authed: isAuthed(),
    onTag: (tag) => aplicarFiltro(tag, { push: true }),
    onBorrar: async (paella, card) => {
      if (!(await borrarPaella(paella))) return;
      feed.quitar(card);
      toast('paella borrada');
      cargarHashtags({ fresca: true });
    },
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

async function cargarHashtags(opts) {
  const lista = await pedirHashtags(opts);
  tagbar.replaceChildren();
  for (const { tag, count } of lista) {
    const btn = el('button', { class: 'tag', attrs: { type: 'button', 'aria-pressed': 'false' } });
    btn.dataset.tag = tag;
    btn.append(el('span', { text: `#${tag}` }), el('span', { class: 'tag-num', text: String(count) }));
    btn.addEventListener('click', () => aplicarFiltro(tag, { push: true }));
    tagbar.append(btn);
  }
  pintarEstadoFiltro(feed.tag);
}

// El botón "atrás" devuelve al filtro anterior sin recargar la página.
window.addEventListener('popstate', () => {
  const tag = tagDeLaUrl();
  feed.setFilter(tag);
  pintarEstadoFiltro(tag);
});

feed.start(tagDeLaUrl());
cargarHashtags();

sesion.then((authed) => {
  if (!authed) return;
  const composer = mountComposer({
    root: $('#composer'),
    // Tras publicar, recargamos la lista desde arriba para que la paella
    // nueva aparezca en su sitio sin tener que refrescar la página.
    onGuardada: () => { aplicarFiltro(null); cargarHashtags({ fresca: true }); },
  });
  // El atajo de la app instalada (mantener pulsado el icono → "subir una
  // paella") entra por /?subir=1 y abre el bloque ya desplegado.
  if (new URLSearchParams(location.search).get('subir')) composer.abrir();
});
