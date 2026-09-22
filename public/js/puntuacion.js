// ----- la puntuación: pintarla y ponerla -----
//
// Los criterios, la media y el veredicto viven en comun/notas.js (sin DOM,
// compartido con el Worker). Aquí sólo está el dibujo.
//
// El mismo dibujo sirve para leer y para puntuar: la fila de bolitas que se ve
// en la ficha es la misma que se arrastra en el formulario. Es un slider de 11
// posiciones disfrazado de bolitas — se arrastra con el dedo, se mueve con las
// flechas del teclado y se anuncia como slider a los lectores de pantalla.

import { el } from './utils.js';
import { CRITERIOS, MAX_NOTA, formatNota, limpia, media, veredicto } from './comun/notas.js';

// Fila de bolitas. `valor` null = sin nota (la fila se apaga y pone "–").
function filaBolitas(valor) {
  const fila = el('span', { class: 'nota-bolitas' });
  for (let i = 1; i <= MAX_NOTA; i++) {
    fila.append(el('span', { class: i <= (valor ?? 0) ? 'bolita llena' : 'bolita' }));
  }
  return fila;
}

// ---------- pintar (sólo lectura) ----------

export function renderPuntuacion(paella) {
  const nota = media(paella);
  if (nota === null) return null;

  const caja = el('div', { class: 'puntuacion' });

  const cabecera = el('div', { class: 'nota-global' });
  const cifra = el('span', { class: 'nota-cifra', text: formatNota(nota) });
  // Un diez redondo se celebra: la cifra late un poco. Es el único sitio de la
  // web con una animación que no es una transición.
  if (nota === MAX_NOTA) cifra.classList.add('perfecta');
  cabecera.append(cifra, el('span', { class: 'nota-sobre', text: `/${MAX_NOTA}` }));
  caja.append(cabecera, el('p', { class: 'nota-veredicto', text: veredicto(nota) }));

  const desglose = el('dl', { class: 'desglose' });
  for (const { clave, etiqueta } of CRITERIOS) {
    const v = limpia(paella?.[clave]);
    const dt = el('dt', { text: etiqueta });
    const dd = el('dd', { class: v === null ? 'sin-nota' : '' });
    dd.append(filaBolitas(v), el('span', { class: 'nota-num', text: formatNota(v) }));
    // Un socarrat perfecto merece su llamita.
    if (clave === 'socarrat' && v === MAX_NOTA) {
      dd.append(el('span', { class: 'chispa', text: '🔥', attrs: { title: 'socarrat perfecto' } }));
    }
    desglose.append(dt, dd);
  }
  caja.append(desglose);
  return caja;
}

// ---------- puntuar (formulario) ----------

// Devuelve { nodo, get, set }. `get()` da un objeto { punto_arroz: n|null, … }
// listo para mandar al servidor.
export function createEditorPuntuacion(valoresIniciales = {}) {
  const valores = {};
  for (const { clave } of CRITERIOS) valores[clave] = limpia(valoresIniciales[clave]);

  const nodo = el('div', { class: 'puntuacion puntuacion-editor' });

  const cifra = el('span', { class: 'nota-cifra' });
  const cabecera = el('div', { class: 'nota-global' });
  cabecera.append(cifra, el('span', { class: 'nota-sobre', text: `/${MAX_NOTA}` }));
  const textoVeredicto = el('p', { class: 'nota-veredicto' });
  nodo.append(cabecera, textoVeredicto);

  const desglose = el('div', { class: 'desglose desglose-editor' });
  const filas = {};

  for (const { clave, etiqueta } of CRITERIOS) {
    const fila = el('div', { class: 'fila-nota' });
    const label = el('span', { class: 'fila-nota-etiqueta', text: etiqueta });
    const num = el('span', { class: 'nota-num' });
    const quitar = el('button', { class: 'quitar-nota', text: 'quitar', attrs: { type: 'button' } });

    // El carril ES el control: role=slider con teclado, y por dentro las
    // bolitas. Arrastrar por encima cambia la nota como en cualquier slider.
    const carril = el('div', {
      class: 'carril',
      attrs: {
        role: 'slider',
        tabindex: '0',
        'aria-label': etiqueta,
        'aria-valuemin': '0',
        'aria-valuemax': String(MAX_NOTA),
      },
    });
    for (let i = 1; i <= MAX_NOTA; i++) carril.append(el('span', { class: 'bolita' }));

    // Posición del dedo → nota. La zona a la izquierda de la primera bolita es
    // el 0, que si no no habría forma de poner (y una paella puede ser un 0).
    const notaEn = (clientX) => {
      const r = carril.getBoundingClientRect();
      const t = (clientX - r.left) / r.width;
      return Math.max(0, Math.min(MAX_NOTA, Math.ceil(t * MAX_NOTA)));
    };

    let arrastrando = false;
    carril.addEventListener('pointerdown', (e) => {
      arrastrando = true;
      carril.setPointerCapture(e.pointerId);
      fijar(clave, notaEn(e.clientX));
    });
    carril.addEventListener('pointermove', (e) => {
      if (!arrastrando) return;
      e.preventDefault();
      fijar(clave, notaEn(e.clientX));
    });
    const soltar = () => { arrastrando = false; };
    carril.addEventListener('pointerup', soltar);
    carril.addEventListener('pointercancel', soltar);

    carril.addEventListener('keydown', (e) => {
      const actual = valores[clave] ?? 0;
      const salto = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (salto) { e.preventDefault(); fijar(clave, Math.max(0, Math.min(MAX_NOTA, actual + salto))); }
      else if (e.key === 'Home') { e.preventDefault(); fijar(clave, 0); }
      else if (e.key === 'End') { e.preventDefault(); fijar(clave, MAX_NOTA); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); fijar(clave, null); }
    });

    quitar.addEventListener('click', () => fijar(clave, null));

    fila.append(label, carril, num, quitar);
    filas[clave] = { fila, carril, num, quitar };
    desglose.append(fila);
  }
  nodo.append(desglose);

  function fijar(clave, valor) {
    valores[clave] = valor === null ? null : limpia(valor);
    pintar();
  }

  function pintar() {
    for (const { clave } of CRITERIOS) {
      const v = valores[clave];
      const { fila, carril, num, quitar } = filas[clave];
      carril.querySelectorAll('.bolita').forEach((b, i) => {
        b.classList.toggle('llena', i < (v ?? 0));
      });
      carril.setAttribute('aria-valuenow', String(v ?? 0));
      carril.setAttribute('aria-valuetext', v === null ? 'sin nota' : `${v} de ${MAX_NOTA}`);
      num.textContent = formatNota(v);
      fila.classList.toggle('sin-nota', v === null);
      quitar.hidden = v === null;
    }
    const nota = media(valores);
    cifra.textContent = formatNota(nota);
    cifra.classList.toggle('perfecta', nota === MAX_NOTA);
    textoVeredicto.textContent = nota === null ? 'sin puntuar todavía' : veredicto(nota);
    nodo.classList.toggle('sin-puntuar', nota === null);
  }

  pintar();

  return {
    nodo,
    get: () => ({ ...valores }),
    set: (nuevos) => {
      for (const { clave } of CRITERIOS) valores[clave] = limpia(nuevos?.[clave]);
      pintar();
    },
  };
}
