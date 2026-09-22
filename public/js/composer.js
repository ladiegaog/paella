// ----- el bloque de subir una paella -----
//
// Vive arriba de la lista, como el composer de notas8: se abre la web ya
// logueada y está ahí, sin navegar a ninguna parte. Plegado es una línea de
// texto; desplegado, el recortador y los campos.
//
// El mismo módulo sirve para editar (/subir?id=N): con `id` arranca abierto,
// carga la paella y guarda con PATCH. Cambiar la foto al editar es opcional —
// si no elige archivo nuevo, se conserva la que había.
//
// Las piezas con estado propio van en su módulo: el recortador (cropper.js),
// la puntuación (puntuacion.js) y la galería (galeria-editor.js). Aquí sólo se
// montan y se orquesta el guardado.

import { el, formatPeso, toast } from './utils.js';
import { api } from './api.js';
import { pedirHashtags, subirImagen } from './acciones.js';
import { createCropper } from './cropper.js';
import { compressCrop } from './compressor.js';
import { createEditorPuntuacion } from './puntuacion.js';
import { createEditorGaleria } from './galeria-editor.js';
import { DESCRIPCION_MAX_LEN, TITULO_MAX_LEN } from './comun/reglas.js';
import { parseHashtagsField } from './comun/tags.js';

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
    attrs: {
      type: 'text', id: 'c-titulo', maxlength: String(TITULO_MAX_LEN), placeholder: 'título', required: '',
    },
  });
  const descripcion = el('textarea', {
    attrs: {
      id: 'c-desc', maxlength: String(DESCRIPCION_MAX_LEN), rows: '3',
      placeholder: 'qué llevaba, cómo salió, quién estaba…',
    },
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
  const galeria = createEditorGaleria();

  // El botón de la cenital va junto al recortador, no en la barra de abajo: es
  // el primer paso, no una acción de cierre.
  const filaFoto = el('div', { class: 'composer-foto' });
  filaFoto.append(btnFoto, estado);

  // El formulario sigue el mismo orden que la ficha: título, la cenital, la
  // puntuación, la descripción, la galería y los hashtags.
  const campos = el('div', { class: 'composer-campos' });
  campos.append(
    etiquetar(titulo, 'título'), titulo,
    cropperRoot, inputFoto, filaFoto,
    puntuacion.nodo,
    etiquetar(descripcion, 'descripción'), descripcion,
    galeria.nodo,
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
  // La cenital ya subida a R2 ({ key, size, crop }). Se guarda para que, si
  // falla lo que viene después y se reintenta, no se vuelva a subir la misma
  // foto. Si entretanto se movió el encuadre, `crop` ya no casa y se sube otra.
  let fotoSubida = null;
  let enviando = false;

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
    fotoElegida = false;
    fotoSubida = null;
    puntuacion.set({});
    galeria.limpiar();
    cropper.reset();
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
      fotoSubida = null;
      estado.textContent = 'arrastra y pellizca para colocar la paella dentro del círculo';
      btnFoto.textContent = 'cambiar la foto';
    } catch (err) {
      console.error(err);
      estado.textContent = '';
      toast('no se pudo abrir esa foto', 'error');
    }
  });

  // --- hashtags que ya existen ---
  pedirHashtags().then((lista) => {
    for (const { tag } of lista.slice(0, 20)) {
      const btn = el('button', { class: 'tag', text: `#${tag}`, attrs: { type: 'button' } });
      btn.addEventListener('click', () => alternarTag(tag));
      sugerencias.append(btn);
    }
  });

  // Añade o quita el tag del campo, respetando lo que ya haya escrito. Lee el
  // campo con la misma función que el servidor, así que lo que se ve es lo que
  // se guarda.
  function alternarTag(tag) {
    const actuales = parseHashtagsField(hashtags.value);
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
      galeria.set(data.fotos);
      cropper.showExisting(`/r2/${data.r2_key}`);
      btnFoto.textContent = 'cambiar la foto';
      estado.textContent = 'si no cambias la foto, se queda la que hay';
    })();
  }

  // --- guardar ---
  const mismoRecorte = (a, b) =>
    !!a && !!b && a.sx === b.sx && a.sy === b.sy && a.side === b.side;

  async function subirCenital() {
    const crop = cropper.getCrop();
    const bitmap = cropper.getBitmap();
    if (!crop || !bitmap) return null;

    estado.textContent = 'preparando la foto…';
    const { blob, side } = await compressCrop(bitmap, crop);
    estado.textContent = `subiendo la foto (${formatPeso(blob.size)})…`;
    return { key: await subirImagen(blob), size: side, crop };
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
      // Sólo se sube foto si hay una nueva recortada; al editar sin tocarla no
      // se manda r2_key y el PATCH deja la anterior.
      if (fotoElegida && !mismoRecorte(fotoSubida?.crop, cropper.getCrop())) {
        fotoSubida = await subirCenital();
      }
      const fotos = await galeria.subir((texto) => { estado.textContent = texto; });
      const body = {
        titulo: titulo.value,
        descripcion: descripcion.value,
        hashtags: hashtags.value,
        notas: puntuacion.get(),
        fotos,
        ...(fotoSubida ? { r2_key: fotoSubida.key, size: fotoSubida.size } : {}),
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

  // Se devuelve para que quien monte el composer pueda desplegarlo (lo usa el
  // atajo /?subir=1 de la app instalada).
  return { abrir: () => desplegar(true) };
}
