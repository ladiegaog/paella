// ----- pintado de una paella -----
//
// El orden es: título, la cenital circular, la puntuación, la descripción, la
// galería y los hashtags. La meta (fecha, editar, borrar) cierra la tarjeta.
//
// Todo el texto entra por textContent (via el()), así que una descripción con
// "<script>" se ve como texto y no se ejecuta. No hay ni un innerHTML en este
// archivo a propósito: es el único sitio donde se construyen nodos con datos
// que vienen de la base.

import { el, formatFecha } from './utils.js';
import { renderPuntuacion } from './puntuacion.js';
import { abrirVisor } from './visor.js';
import { TAG_RE, extractHashtags } from './comun/tags.js';

// Recorre el texto con la regex de los tags (la misma con la que el servidor
// los extrae) en vez de partir por espacios, para no perder los saltos de línea
// ni la puntuación pegada al tag ("#arroz,").
function textoConTags(texto, onTag) {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of texto.matchAll(TAG_RE)) {
    if (m.index > last) frag.append(texto.slice(last, m.index));
    const tag = m[1].toLowerCase();
    const btn = el('button', { class: 'tag tag-inline', text: `#${tag}`, attrs: { type: 'button' } });
    btn.addEventListener('click', () => onTag?.(tag));
    frag.append(btn);
    last = m.index + m[0].length;
  }
  if (last < texto.length) frag.append(texto.slice(last));
  return frag;
}

// La galería: las fotos sueltas, en una tira. Al pulsar una se abre el visor.
function renderGaleria(paella) {
  const fotos = paella.fotos || [];
  if (fotos.length === 0) return null;

  const tira = el('div', { class: 'galeria' });
  fotos.forEach((foto, i) => {
    const btn = el('button', {
      class: 'galeria-foto',
      attrs: { type: 'button', 'aria-label': `ver la foto ${i + 1} de ${fotos.length}` },
    });
    btn.append(
      el('img', {
        attrs: {
          src: `/r2/${foto.r2_key}`,
          alt: `foto ${i + 1} de ${paella.titulo}`,
          loading: 'lazy',
          decoding: 'async',
          width: String(foto.width || 1600),
          height: String(foto.height || 1600),
        },
      }),
    );
    btn.addEventListener('click', () => abrirVisor(fotos, i, paella.titulo));
    tira.append(btn);
  });
  return tira;
}

export function renderPaella(paella, opts = {}) {
  const { onTag, onBorrar, authed = false, comoDetalle = false } = opts;

  const card = el('article', { class: comoDetalle ? 'paella paella-detalle' : 'paella' });
  card.dataset.id = String(paella.id);

  // --- 1. el título ---
  const h = el(comoDetalle ? 'h1' : 'h2', { class: 'paella-titulo' });
  if (comoDetalle) {
    h.append(textoConTags(paella.titulo, onTag));
  } else {
    const a = el('a', { attrs: { href: `/p/${paella.id}` } });
    a.append(textoConTags(paella.titulo, onTag));
    h.append(a);
  }
  card.append(h);

  // --- 2. la cenital, circular ---
  const img = el('img', {
    attrs: {
      src: `/r2/${paella.r2_key}`,
      alt: `paella: ${paella.titulo}`,
      loading: comoDetalle ? 'eager' : 'lazy',
      decoding: 'async',
      // Reservar el hueco cuadrado evita que la lista pegue saltos mientras
      // cargan las fotos (y que se pierda el scroll al cargar más).
      width: String(paella.size || 1200),
      height: String(paella.size || 1200),
    },
  });
  const foto = comoDetalle
    ? el('div', { class: 'paella-foto' })
    : el('a', { class: 'paella-foto', attrs: { href: `/p/${paella.id}` } });
  foto.append(img);
  card.append(foto);

  // --- 3. la puntuación ---
  const puntuacion = renderPuntuacion(paella);
  if (puntuacion) card.append(puntuacion);

  // --- 4. la descripción ---
  if (paella.descripcion) {
    const p = el('p', { class: 'paella-desc' });
    p.append(textoConTags(paella.descripcion, onTag));
    card.append(p);
  }

  // --- 5. la galería ---
  const galeria = renderGaleria(paella);
  if (galeria) card.append(galeria);

  // --- 6. los hashtags ---
  // Sólo los que NO aparecen ya escritos en el texto, para no repetirlos dos
  // veces en la misma tarjeta.
  const enTexto = new Set(extractHashtags(`${paella.titulo} ${paella.descripcion || ''}`));
  const sueltos = (paella.hashtags || []).filter((t) => !enTexto.has(t));
  if (sueltos.length) {
    const fila = el('div', { class: 'paella-tags' });
    for (const tag of sueltos) {
      const btn = el('button', { class: 'tag', text: `#${tag}`, attrs: { type: 'button' } });
      btn.addEventListener('click', () => onTag?.(tag));
      fila.append(btn);
    }
    card.append(fila);
  }

  // --- la meta: fecha y, con sesión, editar/borrar ---
  const meta = el('p', { class: 'paella-meta' });
  meta.append(
    el('time', { text: formatFecha(paella.created_at), attrs: { datetime: paella.created_at } }),
  );
  if (paella.edited_at) meta.append(el('span', { text: 'editada' }));
  if (authed) {
    meta.append(el('a', { text: 'editar', attrs: { href: `/subir?id=${paella.id}` } }));
    const borrar = el('button', { class: 'peligro', text: 'borrar', attrs: { type: 'button' } });
    borrar.addEventListener('click', () => onBorrar?.(paella, card));
    meta.append(borrar);
  }
  card.append(meta);

  return card;
}
