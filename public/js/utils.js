// ----- helpers genéricos: DOM, toast, fechas -----

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Crea un elemento con clase, texto y atributos. `text` se asigna con
// textContent, así que NUNCA interpreta HTML: es el punto único de
// sanitización del render.
export function el(tag, { class: cls, text, attrs } = {}) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// "14 de marzo de 2026". Se prefiere a toLocaleDateString para que la web se
// lea igual en un móvil configurado en inglés.
export function formatFecha(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function formatPeso(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

// Toast accesible (aria-live=polite).
export function toast(msg, type = 'info') {
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
  }
  const node = document.createElement('div');
  node.className = `toast toast-${type}`;
  node.textContent = msg;
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, 3400);
}
