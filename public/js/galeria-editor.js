// ----- la galería del formulario: elegir, quitar y subir fotos sueltas -----
//
// Cada entrada es o una foto ya subida ({ r2_key, width, height }) o una
// pendiente ({ file, url }). Las pendientes se comprimen y se suben al
// publicar, no al elegirlas: así cancelar el formulario no deja objetos
// huérfanos en R2. Mientras tanto la miniatura sale de una URL local.
//
// Devuelve { nodo, set, limpiar, subir }, como el editor de la puntuación.

import { el, toast } from './utils.js';
import { compressPhoto } from './compressor.js';
import { subirImagen } from './acciones.js';
import { MAX_FOTOS } from './comun/reglas.js';

export function createEditorGaleria() {
  const input = el('input', {
    // Sin `capture`: estas fotos suelen estar ya hechas en el carrete, no se
    // hacen en el momento como la cenital.
    attrs: { type: 'file', accept: 'image/*', multiple: '', hidden: '' },
  });
  const boton = el('button', { text: '+ fotos de la comida', attrs: { type: 'button' } });
  const tira = el('div', { class: 'galeria-editor' });
  const fila = el('div', { class: 'composer-foto' });
  fila.append(boton);

  const nodo = document.createDocumentFragment();
  nodo.append(tira, input, fila);

  let fotos = [];

  boton.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const nuevas = [...(input.files || [])].filter((f) => f.type.startsWith('image/'));
    const hueco = MAX_FOTOS - fotos.length;
    if (nuevas.length > hueco) {
      toast(`caben ${MAX_FOTOS} fotos como mucho, me quedo con las primeras`, 'error');
    }
    for (const file of nuevas.slice(0, Math.max(0, hueco))) {
      fotos.push({ file, url: URL.createObjectURL(file) });
    }
    input.value = '';
    pintar();
  });

  function pintar() {
    tira.replaceChildren();
    fotos.forEach((foto, i) => {
      const item = el('div', { class: 'galeria-item' });
      item.append(el('img', { attrs: { src: foto.url || `/r2/${foto.r2_key}`, alt: '' } }));
      const quitar = el('button', {
        class: 'galeria-quitar',
        text: '×',
        attrs: { type: 'button', 'aria-label': `quitar la foto ${i + 1}` },
      });
      quitar.addEventListener('click', () => {
        const [fuera] = fotos.splice(i, 1);
        if (fuera?.url) URL.revokeObjectURL(fuera.url);
        pintar();
      });
      item.append(quitar);
      tira.append(item);
    });
    boton.textContent = fotos.length ? '+ más fotos' : '+ fotos de la comida';
  }

  // Las fotos que ya tiene la paella (al editar).
  function set(lista) {
    limpiar();
    fotos = (lista || []).map(({ r2_key, width, height }) => ({ r2_key, width, height }));
    pintar();
  }

  function limpiar() {
    for (const f of fotos) if (f.url) URL.revokeObjectURL(f.url);
    fotos = [];
    input.value = '';
    pintar();
  }

  // Comprime y sube las pendientes, en el orden de la tira, y devuelve la lista
  // lista para mandar al servidor.
  //
  // Dos detalles:
  //   - Mientras una foto sube se va comprimiendo la siguiente: comprimir es
  //     trabajo de CPU y subir es esperar a la red, así que se solapan bien.
  //   - Cada foto que llega a R2 se queda marcada como subida. Si la 5 de 8
  //     falla y se vuelve a pulsar "publicar", las 4 primeras no se repiten.
  async function subir(avisar = () => {}) {
    const pendientes = fotos.filter((f) => f.file);
    let hechas = 0;
    let anterior = Promise.resolve();
    try {
      for (const foto of pendientes) {
        const { blob, width, height } = await compressPhoto(foto.file);
        await anterior;
        avisar(`subiendo foto ${++hechas} de ${pendientes.length}…`);
        anterior = subirImagen(blob).then((r2_key) => {
          // Se conserva `url` para que la miniatura no parpadee.
          Object.assign(foto, { r2_key, width, height, file: null });
        });
      }
      await anterior;
    } catch (err) {
      await anterior.catch(() => {}); // que no quede una subida colgando sin esperar
      throw err;
    }
    return fotos.map(({ r2_key, width, height }) => ({ r2_key, width, height }));
  }

  return { nodo, set, limpiar, subir };
}
