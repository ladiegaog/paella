// ----- ficha de una paella (/p/:id) -----
//
// Existe para que un enlace a una paella concreta se pueda compartir. Lee el id
// de la ruta (el worker sirve este mismo HTML para cualquier /p/N, con las
// etiquetas de la vista previa ya rellenas) y pide el JSON.

import { $, el } from './utils.js';
import { api } from './api.js';
import { checkAuth, isAuthed } from './auth.js';
import { borrarPaella } from './acciones.js';
import { renderPaella } from './render.js';

const contenedor = $('#detalle');
const id = location.pathname.split('/').filter(Boolean)[1];

(async () => {
  // La sesión y la paella a la vez: no dependen la una de la otra.
  const [, { ok, status, data }] = await Promise.all([checkAuth(), api(`/api/paellas/${id}`)]);
  contenedor.replaceChildren();

  if (!ok) {
    contenedor.append(
      el('p', {
        class: 'feed-vacio',
        text: status === 404 ? 'esta paella ya no está' : 'no se pudo cargar la paella',
      }),
    );
    return;
  }

  document.title = `${data.titulo} — paellas.party`;
  contenedor.append(
    renderPaella(data, {
      comoDetalle: true,
      authed: isAuthed(),
      // Desde la ficha, pulsar un hashtag lleva a la portada ya filtrada.
      onTag: (tag) => { location.href = `/?tag=${encodeURIComponent(tag)}`; },
      onBorrar: async (paella) => {
        if (await borrarPaella(paella)) location.href = '/';
      },
    }),
  );
})();
