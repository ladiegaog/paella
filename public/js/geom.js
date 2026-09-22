// ----- geometría del recorte circular (sin DOM) -----
//
// Modelo: un "escenario" cuadrado de `view` px de lado donde se ve la foto.
// La foto se dibuja a una escala `s` (px de pantalla por px de origen) y se
// desplaza con un offset (ox, oy) que es la posición de su esquina superior
// izquierda respecto a la del escenario — siempre ≤ 0, porque la foto tiene
// que cubrir el escenario entero (no se admiten bandas vacías).
//
// El recorte que se guarda es el cuadrado del escenario; el círculo que se ve
// en la web es el inscrito en ese cuadrado. Guardamos el cuadrado entero para
// no perder información si algún día la forma cambia.
//
// Todo son funciones puras: se testean en Node sin navegador (test/geom.test.js).

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Escala a la que la foto cubre justo el escenario (el lado corto encaja).
export function coverScale(iw, ih, view) {
  return Math.max(view / iw, view / ih);
}

// Zoom máximo permitido: el que deja el recorte en MIN_CROP_PX de origen. Más
// allá estaríamos ampliando píxeles inventados. Tope duro de 6x para que el
// slider no se vuelva inmanejable con fotos enormes.
const MIN_CROP_PX = 400;
const HARD_MAX_ZOOM = 6;

export function maxZoom(iw, ih) {
  const shortest = Math.min(iw, ih);
  return clamp(shortest / MIN_CROP_PX, 1, HARD_MAX_ZOOM);
}

// Mantiene la foto cubriendo el escenario: el offset vive en [view - dim, 0].
// Si la foto es más pequeña que el escenario (no debería pasar, porque `s`
// parte de coverScale) el rango se degrada a [0, 0] en vez de invertirse.
export function clampOffset(offset, displayed, view) {
  return clamp(offset, Math.min(0, view - displayed), 0);
}

// Offsets que centran la foto en el escenario.
export function centeredOffsets(iw, ih, view, s) {
  return { ox: (view - iw * s) / 2, oy: (view - ih * s) / 2 };
}

// Al hacer zoom queremos que el punto `focal` (en coordenadas del escenario,
// p.ej. el centro del pellizco) se quede donde está. Si la escala se multiplica
// por `ratio`, el offset nuevo sale de despejar esa condición.
export function zoomAround(offset, focal, ratio) {
  return focal - (focal - offset) * ratio;
}

// Traduce el estado del escenario al rectángulo de origen que hay que recortar.
// Siempre cuadrado. Se redondea al entero y se recorta contra los bordes por si
// un decimal se sale por una décima de píxel.
export function cropFromView({ iw, ih, view, s, ox, oy }) {
  const side = Math.round(view / s);
  const maxSide = Math.min(iw, ih, side);
  // El "|| 0" normaliza el -0 que sale de redondear -ox/s cuando ox es 0: es
  // inofensivo para drawImage pero ensucia comparaciones y tests.
  const sx = clamp(Math.round(-ox / s), 0, Math.max(0, iw - maxSide)) || 0;
  const sy = clamp(Math.round(-oy / s), 0, Math.max(0, ih - maxSide)) || 0;
  return { sx, sy, side: maxSide };
}

// Lado del cuadrado final que se guarda. No ampliamos: si el recorte es más
// pequeño que el objetivo, se guarda a su resolución real.
export function outputSide(cropSide, target) {
  return Math.max(1, Math.min(target, Math.round(cropSide)));
}
