// ----- service worker -----
//
// Lo que hace que la web se pueda instalar en el móvil y abra al instante.
//
// La regla de oro: NUNCA servir HTML ni la API desde caché si hay red. Un
// service worker mal puesto sirve una versión vieja de la web para siempre y no
// hay forma de que el usuario se entere; por eso lo de red-primero para todo lo
// que cambia, y caché sólo para lo que no cambia nunca.
//
// VERSION no se toca a mano: el Worker (src/paginas.ts) sirve este archivo con
// el id del despliegue en lugar de __VERSION__. Cada deploy cambia así sw.js,
// el navegador instala el worker nuevo y éste borra las cachés viejas.

const VERSION = '__VERSION__';
const CACHE_APP = `paella-app-${VERSION}`;
const CACHE_API = `paella-api-${VERSION}`;
const CACHE_FOTOS = `paella-fotos-${VERSION}`;

// Tope de fotos guardadas. A ~80 KB la cenital y ~200 KB una de galería, 120
// fotos son unos 20 MB: suficiente para que la lista se vea entera sin red y
// lejos del límite que cualquier navegador da a un sitio.
const MAX_FOTOS = 120;

// Tope de respuestas de la API guardadas. Cada página de la lista y cada filtro
// es una entrada distinta (?cursor=…&tag=…); sin tope, esto crecía sin fin.
const MAX_API = 40;

// Lo único de la API que se guarda para verlo sin conexión: las lecturas
// públicas. Nada de /api/me (una sesión vieja enseñaría el bloque de subir a
// quien ya no la tiene) ni de /api/export (lleva la papelera).
const API_CACHEABLE = /^\/api\/(paellas(\/\d+)?|hashtags)$/;

// El esqueleto: lo que hace falta para pintar la portada. Si esta lista se
// queda corta la web sigue funcionando (lo que falte se pide a la red), sólo
// arranca más lento la primera vez sin conexión.
const ESQUELETO = [
  '/',
  '/style.css',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/vendor/fonts/jetbrains-mono.woff2',
  '/js/page-home.js',
  '/js/api.js',
  '/js/acciones.js',
  '/js/auth.js',
  '/js/utils.js',
  '/js/feed.js',
  '/js/render.js',
  '/js/puntuacion.js',
  '/js/visor.js',
  '/js/composer.js',
  '/js/galeria-editor.js',
  '/js/cropper.js',
  '/js/compressor.js',
  '/js/geom.js',
  '/js/pwa.js',
  '/js/comun/reglas.js',
  '/js/comun/tags.js',
  '/js/comun/notas.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE_APP)
      // addAll falla entero si UNA sola petición falla, y entonces el worker no
      // se instala. Se piden de una en una y se ignoran los fallos.
      .then((c) => Promise.allSettled(ESQUELETO.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const vivas = [CACHE_APP, CACHE_API, CACHE_FOTOS];
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => !vivas.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// Recorta una caché a sus `max` entradas más nuevas. Las claves salen en orden
// de inserción, así que las primeras son las más viejas.
async function recortar(cache, max) {
  const claves = await cache.keys();
  if (claves.length > max) {
    await Promise.all(claves.slice(0, claves.length - max).map((k) => cache.delete(k)));
  }
}

// Red primero, y si no hay red lo que haya en caché. Para el HTML y la API.
async function redPrimero(request, cache, { respaldo, max } = {}) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      cache
        .put(request, res.clone())
        .then(() => max && recortar(cache, max))
        .catch(() => {});
    }
    return res;
  } catch (_) {
    return (await cache.match(request)) || (respaldo && (await cache.match(respaldo))) || Response.error();
  }
}

// Devuelve lo de la caché al momento y de paso lo refresca por detrás. Para el
// CSS y los módulos JS: se ven al instante y se actualizan solos en la
// siguiente visita.
async function cacheYRefresco(request, cache) {
  const guardado = await cache.match(request);
  const red = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  return guardado || (await red) || Response.error();
}

// Las fotos son inmutables (su nombre es aleatorio y no se reutiliza nunca), así
// que caché primero sin revalidar.
async function fotoDeCache(request) {
  const cache = await caches.open(CACHE_FOTOS);
  const guardada = await cache.match(request);
  if (guardada) return guardada;

  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    await recortar(cache, MAX_FOTOS);
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Subir una paella, entrar, salir: nunca se tocan. Que una escritura pase por
  // el service worker sólo puede salir mal.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const propia = url.origin === self.location.origin;
  if (!propia) return; // lo de fuera, a la red (ya no se usa nada de fuera)

  // Las fotos de R2.
  if (url.pathname.startsWith('/r2/')) {
    e.respondWith(fotoDeCache(request).catch(() => Response.error()));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (!API_CACHEABLE.test(url.pathname)) return; // siempre a la red, sin guardar
    e.respondWith(caches.open(CACHE_API).then((c) => redPrimero(request, c, { max: MAX_API })));
    return;
  }

  // Navegaciones: red primero, y sin conexión la portada guardada.
  if (request.mode === 'navigate') {
    e.respondWith(caches.open(CACHE_APP).then((c) => redPrimero(request, c, { respaldo: '/' })));
    return;
  }

  // El resto (CSS, módulos JS, iconos, tipografía, códec WebP): caché y refresco.
  e.respondWith(caches.open(CACHE_APP).then((c) => cacheYRefresco(request, c)));
});
