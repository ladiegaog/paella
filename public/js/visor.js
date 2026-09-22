// ----- visor de fotos a pantalla completa -----
//
// Se abre al pulsar una foto de la galería. Un único visor para toda la página
// (se crea la primera vez y se reutiliza), en vez de uno por paella.
//
// Cierra con Escape, con el botón o pulsando fuera de la foto; se pasa de foto
// con las flechas o deslizando el dedo.

import { el } from './utils.js';

let visor = null;
let fotos = [];
let indice = 0;
let devolverFoco = null;

function construir() {
  const raiz = el('div', { class: 'visor', attrs: { role: 'dialog', 'aria-modal': 'true', hidden: '' } });
  const img = el('img', { class: 'visor-img' });
  const cerrar = el('button', { class: 'visor-cerrar', text: 'cerrar', attrs: { type: 'button' } });
  const anterior = el('button', { class: 'visor-nav visor-antes', text: '←', attrs: { type: 'button', 'aria-label': 'foto anterior' } });
  const siguiente = el('button', { class: 'visor-nav visor-despues', text: '→', attrs: { type: 'button', 'aria-label': 'foto siguiente' } });
  const cuenta = el('p', { class: 'visor-cuenta' });

  raiz.append(cerrar, anterior, img, siguiente, cuenta);

  // Pulsar el fondo cierra; pulsar la foto o los botones, no.
  raiz.addEventListener('click', (e) => { if (e.target === raiz) cerrarVisor(); });
  cerrar.addEventListener('click', cerrarVisor);
  anterior.addEventListener('click', () => mover(-1));
  siguiente.addEventListener('click', () => mover(1));

  // Deslizar con el dedo. 40px de umbral para no confundirlo con un toque.
  let x0 = null;
  raiz.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  raiz.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) mover(dx < 0 ? 1 : -1);
  });

  document.body.append(raiz);
  return { raiz, img, cuenta, anterior, siguiente };
}

function pintar() {
  const foto = fotos[indice];
  if (!foto) return;
  visor.img.src = `/r2/${foto.r2_key}`;
  visor.img.alt = `foto ${indice + 1}`;
  visor.cuenta.textContent = fotos.length > 1 ? `${indice + 1} / ${fotos.length}` : '';
  const varias = fotos.length > 1;
  visor.anterior.hidden = !varias;
  visor.siguiente.hidden = !varias;
}

function mover(paso) {
  if (fotos.length < 2) return;
  // Da la vuelta por los dos lados: de la última a la primera y al revés.
  indice = (indice + paso + fotos.length) % fotos.length;
  pintar();
}

// Con el visor abierto el foco no puede salirse a la página de detrás (que ni
// se ve): Tab da la vuelta entre sus botones.
function atraparFoco(e) {
  const botones = [...visor.raiz.querySelectorAll('button')].filter((b) => !b.hidden);
  if (botones.length === 0) return;
  const i = botones.indexOf(document.activeElement);
  const siguiente = e.shiftKey ? (i <= 0 ? botones.length - 1 : i - 1) : (i + 1) % botones.length;
  e.preventDefault();
  botones[siguiente].focus();
}

function alPulsarTecla(e) {
  if (e.key === 'Tab') atraparFoco(e);
  else if (e.key === 'Escape') cerrarVisor();
  else if (e.key === 'ArrowLeft') mover(-1);
  else if (e.key === 'ArrowRight') mover(1);
}

export function abrirVisor(lista, desde = 0, titulo = '') {
  if (!lista?.length) return;
  if (!visor) visor = construir();
  fotos = lista;
  indice = Math.max(0, Math.min(lista.length - 1, desde));
  visor.raiz.setAttribute('aria-label', titulo ? `fotos de ${titulo}` : 'fotos');
  pintar();
  visor.raiz.hidden = false;
  // Bloquear el scroll del fondo mientras el visor está abierto.
  document.body.classList.add('con-visor');
  devolverFoco = document.activeElement;
  visor.raiz.querySelector('.visor-cerrar').focus({ preventScroll: true });
  document.addEventListener('keydown', alPulsarTecla);
}

export function cerrarVisor() {
  if (!visor || visor.raiz.hidden) return;
  visor.raiz.hidden = true;
  visor.img.removeAttribute('src');
  document.body.classList.remove('con-visor');
  document.removeEventListener('keydown', alPulsarTecla);
  // Devolver el foco a la miniatura desde la que se abrió.
  devolverFoco?.focus?.({ preventScroll: true });
  devolverFoco = null;
}
