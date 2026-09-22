// ----- registro del service worker -----
//
// Script clásico (no módulo) y con defer: se ejecuta una vez en cada página y no
// entra en el grafo de módulos de nadie.
//
// El registro se hace después del load a propósito: instalar el worker se pone a
// descargar todo el esqueleto, y si eso pasa durante la primera carga compite
// por el ancho de banda con lo que la usuaria está esperando ver.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Sin service worker la web funciona igual, sólo que no se instala ni
      // abre sin conexión. No molestamos con un aviso.
      console.warn('no se pudo registrar el service worker', err);
    });
  });
}
