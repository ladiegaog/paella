// ----- las reglas del juego, en un solo sitio -----
//
// Todo lo de public/js/comun/ se usa a la vez en el navegador y en el Worker
// (src/ lo importa directamente: wrangler lo empaqueta con esbuild). Así los
// topes que el formulario enseña y los que el servidor valida no pueden
// desincronizarse. Por eso aquí NO puede haber nada de DOM.

export const TITULO_MAX_LEN = 120;
export const DESCRIPCION_MAX_LEN = 2000;

// Tope de fotos de galería por paella. Suficiente para contar la comida entera
// sin que una sola paella pueda llenar el bucket.
export const MAX_FOTOS = 20;

// Tras la compresión en el navegador (WebP calidad 85, lado 1200) una foto pesa
// ~80 KB. Si llega algo cercano al tope es señal de que la compresión no se
// aplicó; el tope está para que un fallo no llene R2, no para ajustar al byte.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
