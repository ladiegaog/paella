// ----- compresión en el navegador: recorte cuadrado → WebP -----
//
// Gotcha de iOS: WebKit (Safari y, por obligación de Apple, TAMBIÉN Chrome y
// Brave en iPhone) NO sabe codificar WebP en canvas. canvas.toBlob('image/webp')
// ignora el tipo y devuelve un PNG sin avisar → la foto subiría sin comprimir
// (un PNG de cámara son ~5 MB). Como la diega va a subir desde el móvil, esto
// no es un caso raro: es el caso normal.
//
// Por eso no dependemos de toBlob: codificamos con el encoder WebP en
// WebAssembly de @jsquash (el códec de Squoosh), que da WebP real en cualquier
// navegador. Es single-thread → no necesita SharedArrayBuffer ni cabeceras
// COOP/COEP, así que la web no tiene que estar cross-origin isolated.
//
// Carga del WASM (la parte delicada):
//   - El bundle "+esm" no sabe resolver la ruta de su propio .wasm, así que lo
//     hacemos a mano: fetch del .wasm + WebAssembly.compile + instantiateWasm.
//     Controlar la URL del binario es lo que hace que funcione de forma fiable.
//   - meta.js trae defaultOptions: el encode() de bajo nivel EXIGE todas las
//     opciones presentes (si no, lanza 'Missing field: "lossless"').
//   - Todo lazy: se carga la primera vez que se comprime una foto.
// Si el WASM no carga (red caída, CDN bloqueado) caemos a canvas.toBlob: en
// escritorio saldrá WebP igual; en iOS saldrá PNG, pero es mejor subir algo
// que fallar.

import { outputSide } from './geom.js';

const QUALITY = 85;        // 0..100 para jsquash (toBlob usa 0..1)
export const TARGET_SIDE = 1200;   // lado de la cenital circular (cuadrada)
const GALERIA_MAX = 1600;          // lado largo de las fotos de galería

const BASE = 'https://cdn.jsdelivr.net/npm/@jsquash/webp@1.5.0';
// Versión NO-SIMD: un único .wasm que funciona en todos los navegadores sin
// depender de detección de features.
const GLUE_URL = `${BASE}/codec/enc/webp_enc.js`;
const WASM_URL = `${BASE}/codec/enc/webp_enc.wasm`;
const META_URL = `${BASE}/meta.js`;

let encoderPromise = null;
function loadWebpEncoder() {
  if (!encoderPromise) {
    encoderPromise = (async () => {
      const [{ default: moduleFactory }, meta, wasmBuf] = await Promise.all([
        import(/* @vite-ignore */ GLUE_URL),
        import(/* @vite-ignore */ META_URL),
        fetch(WASM_URL).then((r) => {
          if (!r.ok) throw new Error(`fetch wasm → ${r.status}`);
          return r.arrayBuffer();
        }),
      ]);
      const defaultOptions = meta.defaultOptions || {};
      const wasmModule = await WebAssembly.compile(wasmBuf);
      const mod = await moduleFactory({
        noInitialRun: true,
        instantiateWasm: (imports, cb) => {
          const instance = new WebAssembly.Instance(wasmModule, imports);
          cb(instance);
          return instance.exports;
        },
      });
      return (imageData, quality) =>
        mod.encode(imageData.data, imageData.width, imageData.height, {
          ...defaultOptions,
          quality,
        });
    })().catch((err) => {
      encoderPromise = null; // permitir reintento en la siguiente foto
      throw err;
    });
  }
  return encoderPromise;
}

// Decodifica un File respetando la orientación EXIF. Es la ÚNICA decodificación
// del flujo: el recortador dibuja este mismo bitmap en su lienzo de previsualización,
// así que las coordenadas del recorte y las del bitmap final son el mismo espacio
// y no hay forma de que una foto vertical salga girada.
export async function decodeFile(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (_) {
    return await createImageBitmap(file); // navegadores sin la opción
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob null'))), type, quality);
  });
}

// Codifica a WebP lo que haya en el lienzo. Camino principal: el encoder WASM.
// Si no carga (red caída, CDN bloqueado) cae a canvas.toBlob, que en escritorio
// da WebP igual y en iOS da PNG — mejor subir algo que fallar.
async function aWebp(canvas, ctx, w, h) {
  try {
    const encode = await loadWebpEncoder();
    const buffer = await encode(ctx.getImageData(0, 0, w, h), QUALITY);
    if (!buffer || !buffer.byteLength) throw new Error('encode vacío');
    return new Blob([buffer], { type: 'image/webp' });
  } catch (err) {
    console.warn('encoder webp wasm no disponible, usando canvas.toBlob', err);
    return canvasToBlob(canvas, 'image/webp', QUALITY / 100);
  }
}

// Foto de galería: sin recorte, sólo reescalada para que el lado largo no pase
// de GALERIA_MAX, y a WebP. Mantiene la proporción original (una foto de la
// mesa es apaisada, una del cocinero es vertical, y las dos valen).
export async function compressPhoto(file) {
  const bitmap = await decodeFile(file);
  const escala = Math.min(1, GALERIA_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  return { blob: await aWebp(canvas, ctx, w, h), width: w, height: h };
}

// Recorta el cuadrado { sx, sy, side } del bitmap y lo codifica a WebP.
// Devuelve { blob, side }.
export async function compressCrop(bitmap, crop) {
  const out = outputSide(crop.side, TARGET_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // drawImage de 9 argumentos: toma (sx, sy, side, side) del bitmap y lo lleva
  // a (0, 0, out, out) del lienzo.
  ctx.drawImage(bitmap, crop.sx, crop.sy, crop.side, crop.side, 0, 0, out, out);
  return { blob: await aWebp(canvas, ctx, out, out), side: out };
}
