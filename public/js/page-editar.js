// ----- editar una paella (/subir?id=N) -----
//
// El bloque de subir vive normalmente arriba de la lista; para editar hace
// falta una página propia, porque la paella que se edita puede estar muy abajo
// en la lista (o no estar, si se llega por el enlace de su ficha).

import { $ } from './utils.js';
import { checkAuth } from './auth.js';
import { mountComposer } from './composer.js';

const id = new URLSearchParams(location.search).get('id');

(async () => {
  await checkAuth();
  if (!id) { location.href = '/'; return; }
  mountComposer({ root: $('#composer'), id });
})();
