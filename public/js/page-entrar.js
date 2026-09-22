// ----- el login -----
//
// Script clásico y no inline: la CSP (src/middleware.ts) no deja ejecutar
// scripts inline, y esto es lo único que hacía falta en esta página.

const ERRORES = {
  // Lo pone el limitador de intentos (LOGIN_LIMITER en wrangler.toml).
  espera: 'demasiados intentos seguidos: espera un minuto',
};

const e = new URLSearchParams(location.search).get('e');
if (e) {
  document.getElementById('err').textContent = ERRORES[e] || 'usuario o contraseña incorrectos';
}
