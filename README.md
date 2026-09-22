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
60 escrituras por minuto y por IP.

### La puntuación

Cuatro notas del 0 al 10 —**punto del arroz**, **sabor del caldo**,
**socarrat** y **sinergia**— y una nota global que es su media.

La global **no se guarda**: se calcula al pintarla, en `puntuacion.js`. Guardarla
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
  (`@jsquash/webp`) cargado desde jsDelivr, con `canvas.toBlob` como red de
  seguridad si el CDN no responde.

La geometría del recorte vive aparte en `geom.js`, sin nada de DOM, y está
cubierta por tests (`test/geom.test.js`).

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
| HTML y `/api/*` | Red primero; la caché sólo si no hay red |
| `/api/me` | Siempre red — servir una sesión vieja enseñaría el bloque de subir a quien ya no la tiene |
| CSS, módulos, tipografías | Caché al momento y refresco por detrás |
| `/r2/*` (las fotos) | Caché primero: sus nombres son aleatorios, nunca cambian |
| Cualquier escritura | Ni se toca |

**Al tocar cualquier archivo de `public/` hay que subir `VERSION` en `sw.js`.** Es
lo que borra las cachés viejas y obliga a rellenarlas.

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

```bash
npm test          # tests (hashtags, login, validación, geometría del recorte)
npx tsc --noEmit  # comprobar los tipos
```

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
código nuevo consulta columnas o tablas que todavía no existen. La migración
también se puede ejecutar sin terminal, desde *Storage & Databases → D1 →
`paella-db` → Console*, pegando el archivo de `migrations/`.

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

# 4. Crear las tablas en la base de datos de producción
npm run db:migrate:remote
# (schema.sql ya trae todo: en una instalación nueva NO hay que aplicar nada
#  de migrations/, que son los cambios para bases de datos que ya existían)

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

`schema.sql` es la foto del esquema **actual**: se aplica entero en una base de
datos nueva y es idempotente. Los cambios sobre una base de datos que ya existe
van en `migrations/`, numerados, y se aplican **una vez** cada uno:

```bash
npm run db:migrate:0001          # en local
npm run db:migrate:0001:remote   # en producción
```

Al añadir una migración hay que tocar los dos sitios: el `ALTER TABLE` en
`migrations/` y la forma final en `schema.sql`. Las migraciones no son
idempotentes (SQLite no tiene `ADD COLUMN IF NOT EXISTS`), así que re-aplicar una
da un error de columna duplicada: molesto, pero inofensivo.

| Migración | Qué hizo |
|---|---|
| `0001-puntuacion-y-galeria.sql` | Las cuatro notas y la tabla `fotos` |

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
Descarga un JSON con todas las paellas, sus notas, sus hashtags y su galería.
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
  index.ts       rutas de la API y de las páginas, validación
  db.ts          todas las consultas a D1
  auth.ts        cookie firmada, comparación en tiempo constante
  hashtags.ts    extraer y normalizar los #tags
  media.ts       claves de R2, tipos permitidos, tope de tamaño

public/
  manifest.json  para que se pueda instalar en el móvil
  sw.js          el service worker: caché e instalación
  icon-*.png     los iconos de la app, sacados del emoji 🥘
  index.html     la lista (y, con sesión, el bloque de subir)
  paella.html    la ficha de una paella (/p/7), para compartir el enlace
  subir.html     editar una paella (/subir?id=7)
  entrar.html    el login
  style.css      toda la hoja de estilo
  js/
    composer.js    el bloque de subir/editar
    puntuacion.js  las cuatro notas, la media y el veredicto (leer y puntuar)
    cropper.js     arrastrar y pellizcar para encuadrar en el círculo
    compressor.js  recorte y reescalado → WebP (con el WASM de Squoosh)
    visor.js       las fotos de la galería a pantalla completa
    geom.js        la matemática del recorte, sin DOM (con tests)
    feed.js        la lista: paginado, scroll infinito, filtro
    render.js      pintar una paella (el único sitio que toca datos de la base)
    api.js         un solo fetch para todo: cookie, CSRF, JSON, errores
    utils.js       DOM, fechas, avisos
    auth.js        saber si hay sesión y enseñar/esconder lo que toca
    state.js       lo poco que comparten los módulos
    pwa.js         registra el service worker
    page-*.js      el arranque de cada página

schema.sql       las tablas (se aplica entero, es idempotente)
migrations/      los cambios de esquema sobre bases de datos que ya existían
wrangler.toml    la configuración de Cloudflare
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
- **La `r2_key` que llega en un POST se valida contra un patrón** (`media.ts`,
  `isSafeMediaKey`) para que nadie pueda apuntar una paella a un objeto
  cualquiera del bucket.
