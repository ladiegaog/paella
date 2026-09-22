// ----- recortador circular: arrastrar para mover, pellizcar para acercar -----
//
// La diega hace la foto cenital con el móvil, normalmente en vertical y con la
// paella descentrada. Esto le deja encuadrarla dentro del círculo antes de
// subirla, con el mismo gesto que cualquier app de fotos.
//
// Cómo se dibuja la previsualización: NO usamos un <img> con la URL del
// archivo, sino un <canvas> donde volcamos UNA vez el bitmap ya decodificado
// con la orientación EXIF aplicada. Así el espacio de coordenadas del recorte
// es exactamente el del bitmap que luego comprimimos, y una foto vertical no
// puede salir tumbada porque el navegador interprete el EXIF de otra manera.
// El canvas se mueve con transform de CSS, así que arrastrar no cuesta trabajo
// de JS por frame.

import {
  centeredOffsets,
  clamp,
  clampOffset,
  coverScale,
  cropFromView,
  maxZoom,
  zoomAround,
} from './geom.js';
import { decodeFile } from './compressor.js';

// Resolución del lienzo de previsualización. Suficiente para verlo nítido en
// cualquier móvil sin tener el bitmap de 12 MP dibujado a tamaño real.
const PREVIEW_MAX = 1600;

export function createCropper(root) {
  const stage = document.createElement('div');
  stage.className = 'cropper-stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'cropper-canvas';
  const mask = document.createElement('div');
  mask.className = 'cropper-mask';
  mask.setAttribute('aria-hidden', 'true');
  stage.append(canvas, mask);

  const zoomRow = document.createElement('div');
  zoomRow.className = 'cropper-zoom-row';
  zoomRow.hidden = true;
  const zoomInput = document.createElement('input');
  zoomInput.type = 'range';
  zoomInput.className = 'cropper-zoom';
  zoomInput.min = '1';
  zoomInput.max = '6';
  zoomInput.step = '0.01';
  zoomInput.value = '1';
  zoomInput.setAttribute('aria-label', 'acercar la foto');
  zoomRow.append(
    Object.assign(document.createElement('span'), { className: 'cropper-zoom-icon', textContent: '−' }),
    zoomInput,
    Object.assign(document.createElement('span'), { className: 'cropper-zoom-icon', textContent: '+' }),
  );

  root.append(stage, zoomRow);

  // --- estado ---
  let bitmap = null;   // ImageBitmap a resolución completa (para comprimir)
  let iw = 0, ih = 0;  // dimensiones de origen, ya orientadas
  let view = 0;        // lado del escenario en px de pantalla
  // Foto ya subida que se enseña al editar. No es recortable (no hay bitmap):
  // sólo se centra en el escenario. Si elige archivo nuevo, load() manda.
  let existente = null;
  let base = 1;        // escala a la que la foto justo cubre el escenario
  let zoom = 1;
  let s = 1;           // escala efectiva = base * zoom
  let ox = 0, oy = 0;

  function apply() {
    canvas.style.width = `${iw * s}px`;
    canvas.style.height = `${ih * s}px`;
    canvas.style.transform = `translate(${ox}px, ${oy}px)`;
  }

  function clampOffsets() {
    ox = clampOffset(ox, iw * s, view);
    oy = clampOffset(oy, ih * s, view);
  }

  // Cambia el zoom manteniendo quieto el punto `focal` (coordenadas del
  // escenario). Sin focal, el centro.
  function setZoom(next, focalX = view / 2, focalY = view / 2) {
    if (!bitmap) return;
    const clamped = clamp(next, 1, maxZoom(iw, ih));
    const nextS = base * clamped;
    const ratio = nextS / s;
    ox = zoomAround(ox, focalX, ratio);
    oy = zoomAround(oy, focalY, ratio);
    zoom = clamped;
    s = nextS;
    clampOffsets();
    apply();
    if (zoomInput.value !== String(zoom)) zoomInput.value = String(zoom);
  }

  // Centra en el escenario la foto ya subida (modo editar).
  function encajarExistente() {
    if (!existente || !view) return;
    const sc = coverScale(existente.w, existente.h, view);
    canvas.style.width = `${existente.w * sc}px`;
    canvas.style.height = `${existente.h * sc}px`;
    const { ox: cx, oy: cy } = centeredOffsets(existente.w, existente.h, view, sc);
    canvas.style.transform = `translate(${cx}px, ${cy}px)`;
  }

  function measure() {
    const next = stage.clientWidth;
    if (!next || next === view) return;
    if (!bitmap) { view = next; encajarExistente(); return; }
    // Conservar el encuadre: el punto de origen que estaba en el centro del
    // escenario sigue en el centro tras cambiar de tamaño (girar el móvil).
    const centerX = (-ox + view / 2) / s;
    const centerY = (-oy + view / 2) / s;
    view = next;
    base = coverScale(iw, ih, view);
    s = base * zoom;
    ox = view / 2 - centerX * s;
    oy = view / 2 - centerY * s;
    clampOffsets();
    apply();
  }

  new ResizeObserver(measure).observe(stage);

  // --- gestos ---
  // Un puntero arrastra; dos pellizcan. Se guardan las posiciones vivas en un
  // Map porque en móvil los eventos de cada dedo llegan por separado.
  const pointers = new Map();
  let pinchStart = null;

  const stagePoint = (e) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  stage.addEventListener('pointerdown', (e) => {
    if (!bitmap) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, stagePoint(e));
    pinchStart = null;
  });

  stage.addEventListener('pointermove', (e) => {
    if (!bitmap || !pointers.has(e.pointerId)) return;
    e.preventDefault();
    const prev = pointers.get(e.pointerId);
    const now = stagePoint(e);
    pointers.set(e.pointerId, now);

    if (pointers.size === 1) {
      ox += now.x - prev.x;
      oy += now.y - prev.y;
      clampOffsets();
      apply();
      return;
    }

    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (!pinchStart) {
      pinchStart = { dist, zoom };
      return;
    }
    if (pinchStart.dist > 0) {
      setZoom((pinchStart.zoom * dist) / pinchStart.dist, mid.x, mid.y);
    }
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  stage.addEventListener(
    'wheel',
    (e) => {
      if (!bitmap) return;
      e.preventDefault();
      const p = stagePoint(e);
      setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), p.x, p.y);
    },
    { passive: false },
  );

  zoomInput.addEventListener('input', () => setZoom(parseFloat(zoomInput.value)));

  // --- API pública ---

  async function load(file) {
    const next = await decodeFile(file);
    bitmap?.close?.();
    bitmap = next;
    existente = null;
    iw = bitmap.width;
    ih = bitmap.height;

    // Volcado único a la resolución de previsualización.
    const ratio = Math.min(1, PREVIEW_MAX / Math.max(iw, ih));
    canvas.width = Math.max(1, Math.round(iw * ratio));
    canvas.height = Math.max(1, Math.round(ih * ratio));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    view = stage.clientWidth || view;
    base = coverScale(iw, ih, view);
    zoom = 1;
    s = base;
    ({ ox, oy } = centeredOffsets(iw, ih, view, s));
    apply();

    zoomInput.max = String(maxZoom(iw, ih));
    zoomInput.value = '1';
    zoomRow.hidden = false;
    root.classList.add('has-image');
  }

  // Muestra una foto ya subida (al editar) como fondo del escenario. No es
  // recortable: si quiere cambiarla, elige un archivo nuevo y se llama a load().
  function showExisting(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (bitmap) return; // ya eligió una foto nueva mientras cargaba
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      existente = { w: img.naturalWidth, h: img.naturalHeight };
      // OJO al orden: hasta que no está la clase, el escenario sigue en
      // display:none y clientWidth vale 0 — medir antes dejaba el lienzo a 0px
      // y la foto no se veía. El ResizeObserver remata el encaje en cuanto el
      // escenario tiene ancho de verdad.
      root.classList.add('has-image');
      view = stage.clientWidth || view;
      encajarExistente();
    };
    img.src = url;
  }

  // Vuelve al estado inicial (sin foto). Lo usa el composer tras publicar,
  // para que la siguiente paella no arranque con el encuadre de la anterior.
  function reset() {
    bitmap?.close?.();
    bitmap = null;
    existente = null;
    canvas.width = canvas.height = 0;
    canvas.style.width = canvas.style.height = '0px';
    canvas.style.transform = 'translate(0px, 0px)';
    zoomInput.value = '1';
    zoomRow.hidden = true;
    root.classList.remove('has-image');
  }

  return {
    load,
    showExisting,
    reset,
    hasImage: () => !!bitmap,
    getBitmap: () => bitmap,
    getCrop: () => (bitmap ? cropFromView({ iw, ih, view, s, ox, oy }) : null),
  };
}
