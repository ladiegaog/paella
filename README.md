# paellas.party

Las paellas que va haciendo la diega. Cada paella lleva un título, una foto
cenital circular, una puntuación desglosada, una descripción, una galería de
fotos de la comida y unos hashtags con los que luego se filtra la lista.

- **Web:** https://paellas.party
- **Repo:** https://github.com/ladiegaog/paella
- **Se despliega en:** Cloudflare Workers (la cuenta de la diega)

---

## Cómo funciona

Es un único Cloudflare Worker que sirve **todo**: la web, la API y las fotos.
No hay build ni framework de front — el HTML, el CSS y los módulos de JS de
`public/` se sirven tal cual.

Las reglas que tienen que coincidir en los dos lados —qué es un #hashtag, los
cuatro criterios de la nota y su veredicto, los topes de longitud y de fotos—
viven **una sola vez**, en `public/js/comun/`. El navegador los carga como
cualquier módulo y el Worker los importa directamente (wrangler los empaqueta).
Así el formulario y el servidor no pueden llevarse la contraria. Por lo mismo,
ahí no puede haber nada de DOM.

| Pieza | Qué hace |
|---|---|
| **Worker** (`src/`, [Hono](https://hono.dev)) | API, login y servir las fotos |
| **D1** (`paella-db`) | Las paellas, sus notas, sus hashtags y su galería (SQLite) |
| **R2** (`paella-storage`) | Las fotos |
| **Workers Assets** (`public/`) | HTML, CSS y JS estáticos |

### Quién puede escribir

La web se **lee** sin entrar. Para subir hace falta iniciar sesión con el
usuario `ladiega` y la contraseña. El usuario está en `[vars]` de
`wrangler.toml` (no es un secreto: se teclea); la contraseña es un secreto de
Cloudflare. La sesión es una cookie firmada con HMAC que dura 60 días.

> **Sobre la contraseña:** `1234567890` es la que se pidió y es la que está
> puesta, pero se adivina en el primer intento. Cambiarla es un comando (abajo,
> en *Cambiar la contraseña*) y no hay que tocar el código.

Además de la contraseña, las escrituras llevan dos cerrojos más: un header
`x-paella-csrf` que un formulario de otra web no puede poner, y un límite de
60 escrituras por minuto y por IP. El login tiene su propio límite, más
estricto: 10 intentos por minuto y por IP, para que nadie pueda probar
contraseñas a ciegas.

Las páginas llevan una **Content-Security-Policy** estricta (`src/middleware.ts`):
sólo se ejecuta lo que sirve la propia web. Se puede porque no hay ni un script
ni un estilo inline y todo —tipografía y códec WebP incluidos— sale de
`public/`. Si algún día hace falta algo de fuera, hay que añadirlo ahí o el
navegador lo bloqueará.

### La puntuación

Cuatro notas del 0 al 10 —**punto del arroz**, **sabor del caldo**,
**socarrat** y **sinergia**— y una nota global que es su media.

La global **no se guarda**: se calcula al pintarla, en `comun/notas.js`. Guardarla
sería tener el mismo dato en dos sitios, y en cuanto se editara una de las
cuatro partes la global se quedaría mintiendo.

Puntuar es opcional y por criterio: una paella puede no tener nota ninguna (no
sale el bloque), o tener sólo el socarrat puntuado. **Sin nota no es lo mismo que
un cero**, y esa distinción es más frágil de lo que parece: `Number(null)` vale
`0` en JavaScript, así que un filtro descuidado convierte una paella sin puntuar
en un cero redondo con su veredicto de "arroz caldoso". Hay un test para eso.

El mismo dibujo sirve para leer y para puntuar: la fila de bolitas de la ficha es
la misma que se arrastra en el formulario. Por dentro es un slider de once
posiciones (el 0 incluido, que una paella puede salir fatal) con teclado y
`role="slider"`.

Y un veredicto en palabras por cada nota, que es la gracia de todo esto.

### La foto circular

La parte con más trabajo dentro. La diega hace la foto cenital con el móvil, en
vertical y normalmente con la paella descentrada; el navegador se encarga del
resto **antes** de subir nada:

1. `cropper.js` deja arrastrar y pellizcar para meter la paella en el círculo.
   Lo que se guarda es el cuadrado; el círculo que se ve en la web es el
   inscrito en él.
2. `compressor.js` recorta ese cuadrado y lo codifica a **WebP de 1200×1200**
   (~80 KB desde una foto de varios MB).
3. Sólo entonces se sube.

Dos cosas que conviene no romper:

- **La decodificación se hace una sola vez**, con `createImageBitmap(…,
  { imageOrientation: 'from-image' })`, y el recortador dibuja *ese mismo*
  bitmap en su lienzo. Así el recorte y la compresión hablan el mismo sistema de
  coordenadas y una foto vertical no puede acabar tumbada por el EXIF.
- **El WebP lo codifica un WASM**, no `canvas.toBlob`. WebKit (Safari y, por
  obligación de Apple, también Chrome y Brave **en iPhone**) no sabe codificar
  WebP en canvas: devuelve un PNG sin avisar. Como la diega sube desde el móvil,
  ese es el caso normal, no el raro. Se usa el códec de Squoosh
  (`@jsquash/webp`), servido desde la propia web (`public/vendor/webp/`), con
  `canvas.toBlob` como red de seguridad si no carga.

La geometría del recorte vive aparte en `geom.js`, sin nada de DOM, y está
cubierta por tests (`test/unit/geom.test.js`).

### Se instala en el móvil

Es una PWA: desde el iPhone, *Compartir → Añadir a pantalla de inicio*; desde
Android, Chrome ofrece instalarla. Se abre sin barra de navegador, con su icono,
y arranca al instante porque el esqueleto (CSS y módulos) está en caché. Al
mantener pulsado el icono aparece el atajo *subir una paella*, que entra por
`/?subir=1` y abre el formulario desplegado.

Sin conexión se ven las paellas ya visitadas, con sus fotos (las últimas 120).
Publicar sí necesita red.

El service worker (`public/sw.js`) tiene una regla de oro: **nunca servir HTML ni
la API desde caché si hay red**. Un service worker descuidado sirve una versión
vieja de la web para siempre y no hay manera de que nadie se entere. Por eso:

| Qué | Cómo |
|---|---|
| HTML | Red primero; la caché sólo si no hay red |
| `/api/paellas`, `/api/hashtags` | Red primero; se guardan las últimas 40 respuestas para verlas sin red |
| El resto de `/api/*` (`/api/me`, `/api/export`…) | Siempre red y nunca se guarda: una sesión vieja enseñaría el bloque de subir a quien ya no la tiene, y la copia lleva la papelera |
| CSS, módulos, tipografía, códec | Caché al momento y refresco por detrás |
| `/r2/*` (las fotos) | Caché primero: sus nombres son aleatorios, nunca cambian |
| Cualquier escritura | Ni se toca |

**La versión del service worker se pone sola.** El Worker sirve `/sw.js` con el
id del despliegue dentro (`[version_metadata]` en `wrangler.toml`), así que cada
deploy cambia el archivo, el navegador instala el service worker nuevo y éste
borra las cachés viejas. No hay que acordarse de nada.

### La galería

Aparte de la cenital, cada paella puede llevar hasta 20 fotos sueltas: la mesa,
la gente, el socarrat de cerca. Estas **no** se recortan ni se redondean — son
fotos normales, se reescalan a 1600 px de lado largo y se pasan a WebP con el
mismo encoder. En la ficha salen en una tira que se desliza, y al pulsarlas se
abren a pantalla completa (flechas, deslizar, Escape).

Se suben **al publicar**, no al elegirlas: así cancelar el formulario no deja
fotos huérfanas en R2. Mientras tanto la miniatura se ve al instante con una
URL local.

---

## Trabajar en local

Hace falta **Node 22 o más**.

```bash
npm install
cp .dev.vars.example .dev.vars   # y pon dentro la contraseña que quieras en local
npm run db:migrate               # crea las tablas en la D1 LOCAL (.wrangler/)
npm run dev                      # http://localhost:8787
```

`npm run dev` no toca nada de producción: usa una D1 y una R2 locales, dentro
de `.wrangler/`. Para borrarlo todo y empezar de cero, borra esa carpeta.

> **Si ya tenías una D1 local de antes de las migraciones nativas** (de cuando
> había un `schema.sql`), `npm run db:migrate` fallará con "duplicate column".
> Ejecuta una vez `npm run db:adoptar` y después `npm run db:migrate`. Ver
> *Cambiar el esquema*.

```bash
npm test          # todos los tests
npx tsc --noEmit  # comprobar los tipos
npm run types     # regenerar worker-configuration.d.ts tras tocar wrangler.toml
npm run vendor    # recopiar el códec y la tipografía a public/vendor/
```

Hay dos tandas de tests (`vitest.config.ts`):

- **`test/unit/`**: las funciones puras (geometría del recorte, notas, tags,
  validación, la cookie). Corren en Node.
- **`test/worker/`**: el Worker entero dentro de workerd, el runtime de verdad,
  con una D1 y una R2 locales vacías y las migraciones aplicadas. Prueban las
  rutas de punta a punta: crear, editar, paginar, borrar, subir fotos, los
  cerrojos, la vista previa de la ficha y que una escritura a medias no deje
  nada guardado.

---

## Desplegar

### Lo normal: hacer push

El Worker está conectado al repo con **Workers Builds**, así que cada push a
`main` despliega solo. No hace falta terminal, ni token, ni secrets de GitHub.

Se configura una vez desde el panel de Cloudflare: *Compute → Workers & Pages →
`paella` → Settings → Build → Connect to Git*, eligiendo `ladiegaog/paella` y la
rama `main`, con `npx wrangler deploy` como comando de despliegue.

(Antes esto era un workflow de GitHub Actions. Se quitó porque poner el secret
del repo pide permisos de admin sobre él, y Workers Builds no los necesita.)

### A mano, desde el ordenador de la diega

```bash
npx wrangler login    # abre el navegador: entra con SU cuenta de Cloudflare
npx wrangler deploy
```

`wrangler login` guarda la sesión en su ordenador, así que sólo hay que hacerlo
la primera vez.

### Si el cambio toca la base de datos

**Primero la migración, después el despliegue.** Al revés, la web se cae: el
código nuevo consulta columnas o tablas que todavía no existen.

```bash
npm run db:migrate:remote   # aplica las que falten, y sólo esas
```

> **Una sola vez, en la D1 de producción:** esa base de datos se montó antes de
> usar las migraciones nativas, así que D1 no sabe que ya tiene la 0000 y la
> 0001. Antes del primer `db:migrate:remote` hay que decírselo:
>
> ```bash
> npm run db:adoptar:remote
> ```
>
> También se puede hacer sin terminal, desde *Storage & Databases → D1 →
> `paella-db` → Console*, pegando `scripts/adoptar-migraciones.sql`. Después,
> `db:migrate:remote` aplicará sólo la 0002 (un índice: la web funciona igual
> con ella que sin ella, así que aquí el orden no importa).

---

## Montarlo desde cero en otra cuenta de Cloudflare

Sólo si hay que rehacerlo. Todo desde la carpeta del repo:

```bash
# 1. Entrar en la cuenta
npx wrangler login
npx wrangler whoami           # apunta el Account ID que sale aquí

# 2. Crear la base de datos y el bucket
npx wrangler d1 create paella-db          # apunta el database_id que imprime
npx wrangler r2 bucket create paella-storage

# 3. Poner esos dos ids en wrangler.toml (account_id y database_id)

# 4. Crear las tablas en la base de datos de producción (aplica todas las
#    migrations/ en orden; en una base de datos nueva NO hace falta db:adoptar)
npm run db:migrate:remote

# 5. Los secretos (los pide por teclado, no quedan en el historial)
npx wrangler secret put PASSWORD       # la contraseña de la diega
npx wrangler secret put AUTH_SECRET    # una cadena larga y aleatoria, ver abajo

# 6. Desplegar
npx wrangler deploy
```

Para generar un `AUTH_SECRET` decente:

```bash
openssl rand -base64 48
```

El dominio se configura solo al desplegar (`routes` en `wrangler.toml`),
**siempre que la zona `paellas.party` esté añadida a esa misma cuenta de
Cloudflare**. Si no lo está, hay que añadirla primero desde el panel y apuntar
los nameservers del dominio a los que indique Cloudflare.

---

## Cambiar el esquema

El esquema es la suma de las migraciones de `migrations/`, numeradas y en
orden. Se usan las **migraciones nativas de D1**: wrangler apunta en la tabla
`d1_migrations` cuáles van aplicadas y sólo ejecuta las que falten, así que
`npm run db:migrate` (local) y `npm run db:migrate:remote` (producción) se
pueden lanzar las veces que haga falta.

Para cambiar algo:

```bash
npx wrangler d1 migrations create paella-db lo-que-cambia   # crea migrations/000N_lo_que_cambia.sql
npm run db:migrate                                          # probarla en local
npm test                                                    # los tests del Worker la aplican también
```

Una migración ya aplicada en producción **no se edita**: si hay que corregirla,
va otra detrás.

| Migración | Qué hizo |
|---|---|
| `0000_inicial.sql` | Paellas y hashtags |
| `0001_puntuacion_y_galeria.sql` | Las cuatro notas y la tabla `fotos` |
| `0002_indice_de_la_lista.sql` | Un índice parcial con sólo las paellas visibles, en el orden de la lista |

`scripts/adoptar-migraciones.sql` es para las bases de datos que existían antes
de esto (ver *Si el cambio toca la base de datos*).

## Mantenimiento

### Cambiar la contraseña

```bash
npx wrangler secret put PASSWORD
npx wrangler deploy
```

No hace falta tocar código. Las sesiones abiertas siguen valiendo; para
cerrarlas todas de golpe, cambia también `AUTH_SECRET`.

### Cambiar el nombre de usuario

Es la línea `USUARIO` en `[vars]` de `wrangler.toml`. Se cambia, se hace push.

### Sacar una copia de todo

Con la sesión iniciada, en el navegador: **https://paellas.party/api/export**.
Descarga un JSON con todas las paellas, sus notas, sus hashtags y su galería,
**papelera incluida** (las borradas llevan su `deleted_at`).
Las fotos no van dentro (son los archivos de R2), pero el JSON lleva la clave de
cada una.

### Recuperar una paella borrada

Borrar no borra: marca la fila con `deleted_at` y deja la foto en R2. Para
recuperarla:

```bash
npx wrangler d1 execute paella-db --remote \
  --command "UPDATE paellas SET deleted_at = NULL WHERE id = 7"
```

Para ver cuáles están en la papelera:

```bash
npx wrangler d1 execute paella-db --remote \
  --command "SELECT id, titulo, deleted_at FROM paellas WHERE deleted_at IS NOT NULL"
```

### Ver los errores en vivo

```bash
npx wrangler tail
```

---

## El mapa de los archivos

```
src/
  index.ts       junta la API y las páginas, y pone las cabeceras de seguridad
  api.ts         las rutas de /api: login, lecturas, escrituras, subir fotos
  paginas.ts     las páginas, la vista previa de la ficha, /sw.js y /r2/*
  validate.ts    validar y sanear lo que llega al crear o editar
  middleware.ts  CSRF, límites por IP y la CSP
  db.ts          todas las consultas a D1
  auth.ts        cookie firmada, comparación en tiempo constante
  media.ts       claves de R2 y tipos de imagen permitidos
  env.ts         el tipo del contexto de Hono

public/
  manifest.json  para que se pueda instalar en el móvil
  sw.js          el service worker: caché e instalación
  icon-*.png     los iconos de la app, sacados del emoji 🥘
  index.html     la lista (y, con sesión, el bloque de subir)
  paella.html    la ficha de una paella (/p/7), para compartir el enlace
  subir.html     editar una paella (/subir?id=7)
  entrar.html    el login
  style.css      toda la hoja de estilo
  vendor/        el códec WebP y la tipografía (copiados con `npm run vendor`)
  js/
    comun/         lo que comparten navegador y Worker (sin DOM)
      reglas.js      topes: longitudes, fotos por paella, peso de una foto
      tags.js        qué es un #hashtag y cómo se leen
      notas.js       los cuatro criterios, la media y el veredicto
    composer.js      el bloque de subir/editar: monta las piezas y guarda
    galeria-editor.js  elegir, quitar y subir las fotos de la galería
    puntuacion.js    pintar las notas y el editor de bolitas
    cropper.js       arrastrar y pellizcar para encuadrar en el círculo
    compressor.js    recorte y reescalado → WebP (con el WASM de Squoosh)
    visor.js         las fotos de la galería a pantalla completa
    geom.js          la matemática del recorte, sin DOM (con tests)
    feed.js          la lista: paginado, scroll infinito, filtro
    render.js        pintar una paella (el único sitio que toca datos de la base)
    acciones.js      borrar, subir una imagen y pedir los hashtags
    api.js           un solo fetch para todo: cookie, CSRF, JSON, errores
    utils.js         DOM, fechas, avisos
    auth.js          saber si hay sesión y enseñar/esconder lo que toca
    pwa.js           registra el service worker
    page-*.js        el arranque de cada página

migrations/      el esquema, migración a migración (migraciones nativas de D1)
scripts/         copiar lo de vendor/ y adoptar las migraciones en una D1 vieja
test/unit/       tests de funciones puras, en Node
test/worker/     tests del Worker entero, dentro de workerd
wrangler.toml    la configuración de Cloudflare
worker-configuration.d.ts   los tipos de los bindings (`npm run types`)
```

## Decisiones que igual sorprenden

- **La nota global no se guarda:** es la media de las cuatro, calculada al
  pintarla. Guardarla sería duplicar el dato y arriesgarse a que mienta.
- **La galería se sube al publicar, no al elegir la foto:** cancelar el
  formulario no deja nada tirado en R2.
- **Los iconos salen del emoji del sistema**, renderizado a PNG. Apple Color
  Emoji es una fuente de bitmaps y 160 px es el tamaño más grande que trae, así
  que ese es el techo de nitidez del icono de 512.
- **`apple-touch-icon` apunta a un PNG y no al SVG:** iOS ignora los SVG ahí y
  pone una captura de la web como icono.
- **`run_worker_first = true`** en `wrangler.toml` no es opcional: sin eso,
  Cloudflare sirve los archivos de `public/` sin pasar por el Worker, y `/subir`
  se vería sin haber entrado.
- **El login va a `/api/login`** y no a `/entrar`: Cloudflare intercepta los
  POST a rutas que coinciden con un archivo estático (`/entrar` ↔
  `entrar.html`) y responde 405 antes de que el Worker se entere.
- **La ficha pasa por el Worker antes de servirse** (`paginas.ts`): WhatsApp y
  Telegram arman la vista previa de un enlace con las etiquetas `og:*` del HTML
  y no ejecutan JavaScript, así que el título, la cenital y el veredicto se
  meten ahí con `HTMLRewriter`.
- **Crear o editar es una sola transacción** (`db.batch` en `db.ts`): la paella,
  sus tags y sus fotos entran juntas o no entra nada. Si no, un fallo a medias
  dejaba la paella creada, el navegador veía un error y al reintentar salía
  duplicada.
- **Reintentar no vuelve a subir fotos:** si falla la publicación después de
  haber subido algunas, el formulario se acuerda de cuáles ya están en R2.
- **La `r2_key` que llega en un POST se valida contra un patrón** (`media.ts`,
  `isSafeMediaKey`) para que nadie pueda apuntar una paella a un objeto
  cualquiera del bucket.
