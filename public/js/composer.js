// ----- el bloque de subir una paella -----
//
// Vive arriba de la lista, como el composer de notas8: se abre la web ya
// logueada y está ahí, sin navegar a ninguna parte. Plegado es una línea de
// texto; desplegado, el recortador y los tres campos.
//
// El mismo módulo sirve para editar (/subir?id=N): con `id` arranca abierto,
// carga la paella y guarda con PATCH. Cambiar la foto al editar es opcional —
// si no elige archivo nuevo, se conserva la que había.

import { el, formatPeso, toast } from './utils.js';
import { api } from './api.js';
import { LIMITS } from './state.js';
import { createCropper } from './cropper.js';
import { compressCrop, compressPhoto } from './compressor.js';
import { createEditorPuntuacion } from './puntuacion.js';

export function mountComposer({ root, id = null, onGuardada }) {
  const editando = !!id;

  // --- DOM ---
  const abrir = el('button', {
    class: 'composer-abrir',
    text: '+ subir una paella',
    attrs: { type: 'button', 'aria-expanded': 'false' },
  });

  const caja = el('form', { class: 'composer-caja' });
  caja.noValidate = true;

  const cropperRoot = el('div', { class: 'cropper' });
  const cropper = createCropper(cropperRoot);

  const inputFoto = el('input', {
    // capture="environment" hace que el móvil abra directamente la cámara
    // trasera, que es con la que se hace la foto cenital. En escritorio el
    // atributo se ignora y sale el selector de archivos de siempre.
    attrs: { type: 'file', accept: 'image/*', capture: 'environment', hidden: '' },
  });
  const btnFoto = el('button', { text: 'hacer o elegir la foto', attrs: { type: 'button' } });
  const estado = el('p', { class: 'ayuda' });

  const titulo = el('input', {
    attrs: { type: 'text', id: 'c-titulo', maxlength: '120', placeholder: 'título', required: '' },
  });
  const descripcion = el('textarea', {
    attrs: { id: 'c-desc', maxlength: '2000', rows: '3', placeholder: 'qué llevaba, cómo salió, quién estaba…' },
  });
  const hashtags = el('input', {
    attrs: { type: 'text', id: 'c-tags', placeholder: '#leña #marisco #domingo' },
  });
  const sugerencias = el('div', { class: 'sugerencias' });
  const ayudaTags = el('p', {
    class: 'ayuda',
    text: 'separados por espacios · los que escribas en el título o la descripción también cuentan',
  });
  const etiquetar = (campo, texto) =>
    el('label', { class: 'visually-hidden', text: texto, attrs: { for: campo.id } });

  const puntuacion = createEditorPuntuacion();

  // El botón de la cenital va junto al recortador, no en la barra de abajo: es
  // el primer paso, no una acción de cierre.
  const filaFoto = el('div', { class: 'composer-foto' });
  filaFoto.append(btnFoto, estado);

  // --- galería ---
  const inputGaleria = el('input', {
    // Sin `capture`: estas fotos suelen estar ya hechas en el carrete, no se
    // hacen en el momento como la cenital.
    attrs: { type: 'file', accept: 'image/*', multiple: '', hidden: '' },
  });
  const btnGaleria = el('button', { text: '+ fotos de la comida', attrs: { type: 'button' } });
  const tiraGaleria = el('div', { class: 'galeria-editor' });
  const filaGaleria = el('div', { class: 'composer-foto' });
  filaGaleria.append(btnGaleria);

  // El formulario sigue el mismo orden que la ficha: título, la cenital, la
  // puntuación, la descripción, la galería y los hashtags.
  const campos = el('div', { class: 'composer-campos' });
  campos.append(
    etiquetar(titulo, 'título'), titulo,
    cropperRoot, inputFoto, filaFoto,
    puntuacion.nodo,
    etiquetar(descripcion, 'descripción'), descripcion,
    tiraGaleria, inputGaleria, filaGaleria,
    etiquetar(hashtags, 'hashtags'), hashtags, ayudaTags, sugerencias,
  );

  const cancelar = el('button', { text: 'cancelar', attrs: { type: 'button' } });
  const publicar = el('button', {
    class: 'publicar',
    text: editando ? 'guardar cambios' : 'publicar',
    attrs: { type: 'submit' },
  });
  const bar = el('div', { class: 'composer-bar' });
  bar.append(cancelar, publicar);

  caja.append(campos, bar);
  root.append(abrir, caja);

  // --- estado ---
  let fotoElegida = false;
  let enviando = false;

  // La galería. Cada entrada es o una foto ya subida ({ r2_key, width, height })
  // o una pendiente ({ file, url }). Las pendientes se comprimen y se suben al
  // publicar, no al elegirlas: así cancelar el formulario no deja objetos
  // huérfanos en R2.
  let galeria = [];

  function desplegar(abierto) {
    abrir.hidden = abierto;
    caja.hidden = !abierto;
    abrir.setAttribute('aria-expanded', String(abierto));
    if (abierto) titulo.focus({ preventScroll: true });
  }
  desplegar(editando);

  abrir.addEventListener('click', () => desplegar(true));
  cancelar.addEventListener('click', () => {
    if (editando) { location.href = '/'; return; }
    limpiar();
    desplegar(false);
  });

  function limpiar() {
    titulo.value = '';
    descripcion.value = '';
    hashtags.value = '';
    estado.textContent = '';
    btnFoto.textContent = 'hacer o elegir la foto';
    inputFoto.value = '';
    inputGaleria.value = '';
    fotoElegida = false;
    puntuacion.set({});
    for (const f of galeria) if (f.url) URL.revokeObjectURL(f.url);
    galeria = [];
    pintarGaleria();
    cropper.reset();
  }

  // --- galería ---

  const MAX_FOTOS = 20; // el mismo tope que valida el servidor

  btnGaleria.addEventListener('click', () => inputGaleria.click());

  inputGaleria.addEventListener('change', () => {
    const nuevas = [...(inputGaleria.files || [])].filter((f) => f.type.startsWith('image/'));
    const hueco = MAX_FOTOS - galeria.length;
    if (nuevas.length > hueco) {
      toast(`caben ${MAX_FOTOS} fotos como mucho, me quedo con las primeras`, 'error');
    }
    for (const file of nuevas.slice(0, Math.max(0, hueco))) {
      // URL local para la miniatura: se ve al instante, sin esperar a subirla.
      galeria.push({ file, url: URL.createObjectURL(file) });
    }
    inputGaleria.value = '';
    pintarGaleria();
  });

  function pintarGaleria() {
    tiraGaleria.replaceChildren();
    galeria.forEach((foto, i) => {
      const item = el('div', { class: 'galeria-item' });
      item.append(el('img', { attrs: { src: foto.url || `/r2/${foto.r2_key}`, alt: '' } }));
      const quitar = el('button', {
        class: 'galeria-quitar',
        text: '×',
        attrs: { type: 'button', 'aria-label': `quitar la foto ${i + 1}` },
      });
      quitar.addEventListener('click', () => {
        const [fuera] = galeria.splice(i, 1);
        if (fuera?.url) URL.revokeObjectURL(fuera.url);
        pintarGaleria();
      });
      item.append(quitar);
      tiraGaleria.append(item);
    });
    btnGaleria.textContent = galeria.length ? '+ más fotos' : '+ fotos de la comida';
  }

  // --- foto ---
  btnFoto.addEventListener('click', () => inputFoto.click());

  inputFoto.addEventListener('change', async () => {
    const file = inputFoto.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('eso no parece una foto', 'error');
    estado.textContent = 'abriendo la foto…';
    try {
      await cropper.load(file);
      fotoElegida = true;
      estado.textContent = 'arrastra y pellizca para colocar la paella dentro del círculo';
      btnFoto.textContent = 'cambiar la foto';
    } catch (err) {
      console.error(err);
      estado.textContent = '';
      toast('no se pudo abrir esa foto', 'error');
    }
  });

  // --- hashtags que ya existen ---
  (async () => {
    const { ok, data } = await api('/api/hashtags');
    if (!ok || !Array.isArray(data) || data.length === 0) return;
    for (const { tag } of data.slice(0, 20)) {
      const btn = el('button', { class: 'tag', text: `#${tag}`, attrs: { type: 'button' } });
      btn.addEventListener('click', () => alternarTag(tag));
      sugerencias.append(btn);
    }
  })();

  // Añade o quita el tag del campo, respetando lo que ya haya escrito.
  function alternarTag(tag) {
    const actuales = hashtags.value
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, '').toLowerCase())
      .filter(Boolean);
    const i = actuales.indexOf(tag);
    if (i >= 0) actuales.splice(i, 1);
    else actuales.push(tag);
    hashtags.value = actuales.map((t) => `#${t}`).join(' ');
  }

  // --- cargar al editar ---
  if (editando) {
    (async () => {
      const { ok, data } = await api(`/api/paellas/${id}`);
      if (!ok) return toast('no se encontró esa paella', 'error');
      titulo.value = data.titulo;
      descripcion.value = data.descripcion || '';
      hashtags.value = (data.hashtags || []).map((t) => `#${t}`).join(' ');
      puntuacion.set(data);
      galeria = (data.fotos || []).map((f) => ({
        r2_key: f.r2_key,
        width: f.width,
        height: f.height,
      }));
      pintarGaleria();
      cropper.showExisting(`/r2/${data.r2_key}`);
      btnFoto.textContent = 'cambiar la foto';
      estado.textContent = 'si no cambias la foto, se queda la que hay';
    })();
  }

  // --- guardar ---
  async function subirFoto() {
    const crop = cropper.getCrop();
    const bitmap = cropper.getBitmap();
    if (!crop || !bitmap) return null;

    estado.textContent = 'preparando la foto…';
    const { blob, side } = await compressCrop(bitmap, crop);
    if (blob.size > LIMITS.image) throw new Error('la foto comprimida sigue siendo demasiado grande');

    estado.textContent = `subiendo la foto (${formatPeso(blob.size)})…`;
    const { ok, data } = await api('/api/upload', {
      method: 'POST',
      body: blob,
      headers: { 'content-type': blob.type },
    });
    if (!ok) throw new Error(data?.error || 'no se pudo subir la foto');
    return { key: data.key, size: side };
  }

  // Comprime y sube las fotos pendientes, conservando el orden de la tira.
  // Las que ya estaban subidas (al editar) pasan tal cual.
  async function subirGaleria() {
    const salida = [];
    const pendientes = galeria.filter((f) => f.file).length;
    let hechas = 0;

    for (const foto of galeria) {
      if (!foto.file) {
        salida.push({ r2_key: foto.r2_key, width: foto.width, height: foto.height });
        continue;
      }
      hechas++;
      estado.textContent = `subiendo foto ${hechas} de ${pendientes}…`;
      const { blob, width, height } = await compressPhoto(foto.file);
      if (blob.size > LIMITS.image) throw new Error('una de las fotos es demasiado grande');
      const { ok, data } = await api('/api/upload', {
        method: 'POST',
        body: blob,
        headers: { 'content-type': blob.type },
      });
      if (!ok) throw new Error(data?.error || 'no se pudo subir una de las fotos');
      salida.push({ r2_key: data.key, width, height });
    }
    return salida;
  }

  caja.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (!titulo.value.trim()) return toast('ponle un título', 'error');
    if (!editando && !fotoElegida) return toast('falta la foto de la paella', 'error');

    enviando = true;
    publicar.disabled = true;
    const textoBoton = publicar.textContent;
    publicar.textContent = 'guardando…';

    try {
      // Sólo se sube foto si hay una nueva recortada; al editar sin tocarla,
      // esto devuelve null y el PATCH deja el r2_key anterior.
      const foto = fotoElegida ? await subirFoto() : null;
      const fotos = await subirGaleria();
      const body = {
        titulo: titulo.value,
        descripcion: descripcion.value,
        hashtags: hashtags.value,
        notas: puntuacion.get(),
        fotos,
        ...(foto ? { r2_key: foto.key, size: foto.size } : {}),
      };
      const { ok, data } = editando
        ? await api(`/api/paellas/${id}`, { method: 'PATCH', body })
        : await api('/api/paellas', { method: 'POST', body });
      if (!ok) throw new Error(data?.error || 'no se pudo guardar');

      if (editando) {
        location.href = `/p/${data.id}`;
        return;
      }
      limpiar();
      desplegar(false);
      toast('paella publicada');
      onGuardada?.(data);
    } catch (err) {
      console.error(err);
      toast(err.message || 'no se pudo guardar', 'error');
      estado.textContent = '';
    } finally {
      enviando = false;
      publicar.disabled = false;
      publicar.textContent = textoBoton;
    }
  });
}
