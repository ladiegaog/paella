// ----- estado compartido entre módulos -----

// Header CSRF: todo POST/PATCH/DELETE lo lleva (lo añade api.js). El worker
// (src/index.ts → requireCsrf) exige exactamente este header con valor "1".
export const CSRF_HEADERS = { 'x-paella-csrf': '1' };

// Tope de subida en bytes. Default sensato; checkAuth() lo sobreescribe con el
// del servidor (/api/me) para que haya una sola fuente de verdad. Objeto
// mutable (no se reasigna el binding) para que los importadores vean el valor
// actualizado por live binding.
export const LIMITS = { image: 10485760 };
