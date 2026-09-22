// ----- la TL: carga paginada, scroll infinito y filtro por hashtag -----

import { api } from './api.js';
import { el, toast } from './utils.js';
import { renderPaella } from './render.js';

// `antesDePintar` es una promesa a la que esperan las tarjetas antes de
// pintarse (la sesión: con ella llevan editar y borrar). La petición no la
// espera, así que las dos cosas van en paralelo.
export function createFeed({ container, sentinel, cardOpts, antesDePintar = null }) {
  let cursor = null;
  let tag = null;
  let loading = false;
  let done = false;
  // Cada filtro incrementa este contador. Una respuesta que llega tarde y trae
  // un token viejo se descarta, así un doble clic rápido en dos hashtags no
  // mezcla resultados de los dos.
  let token = 0;

  async function loadMore() {
    if (loading || done) return;
    loading = true;
    const mine = token;
    const params = new URLSearchParams({ limit: '12' });
    if (cursor) params.set('cursor', cursor);
    if (tag) params.set('tag', tag);

    const [{ ok, data }] = await Promise.all([api(`/api/paellas?${params}`), antesDePintar]);
    if (mine !== token) return; // filtro cambiado mientras cargaba
    loading = false;

    if (!ok || !data) {
      toast('no se pudieron cargar las paellas', 'error');
      return;
    }
    for (const paella of data.paellas) {
      container.append(renderPaella(paella, cardOpts(paella)));
    }
    cursor = data.nextCursor;
    if (!cursor) done = true;
    if (container.childElementCount === 0) pintarVacio();
    // Encadena si el centinela sigue a la vista (pantalla alta, pocas paellas).
    if (!done && sentinel && enPantalla(sentinel)) loadMore();
  }

  function pintarVacio() {
    container.append(
      el('p', {
        class: 'feed-vacio',
        text: tag ? `todavía no hay ninguna paella con #${tag}` : 'todavía no hay paellas por aquí…',
      }),
    );
  }

  // Quita una tarjeta (al borrar). Si era la última, sale el aviso de lista
  // vacía en vez de quedarse la página en blanco.
  function quitar(card) {
    card.remove();
    if (container.childElementCount === 0 && done) pintarVacio();
  }

  function enPantalla(node) {
    return node.getBoundingClientRect().top < (window.innerHeight || 0) + 300;
  }

  function animarEntrada() {
    container.classList.remove('feed-enter');
    void container.offsetWidth; // fuerza reflow para reiniciar la animación
    container.classList.add('feed-enter');
  }

  function setFilter(nextTag) {
    tag = nextTag || null;
    cursor = null;
    done = false;
    loading = false;
    token++;
    container.replaceChildren();
    animarEntrada();
    loadMore();
  }

  function start(initialTag = null) {
    tag = initialTag || null;
    if (sentinel && 'IntersectionObserver' in window) {
      new IntersectionObserver(
        (entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); },
        { rootMargin: '500px' },
      ).observe(sentinel);
    }
    animarEntrada();
    loadMore();
  }

  return { start, setFilter, quitar, get tag() { return tag; } };
}
