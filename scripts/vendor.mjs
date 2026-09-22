// Copia a public/vendor/ lo que la web usa de node_modules: el códec WebP de
// Squoosh (@jsquash/webp) y la tipografía (JetBrains Mono variable).
//
// Se sirven desde el propio dominio y no desde un CDN para que subir una foto
// no dependa de un tercero (sin el códec, en iPhone se subiría un PNG), para que
// la PWA funcione sin conexión y para que la CSP pueda ser 'self' a secas.
//
// Los archivos copiados van al repo (no hay build). Para actualizarlos: subir la
// versión en package.json, `npm install` y `npm run vendor`.

import { cpSync, mkdirSync } from "node:fs";

const COPIAS = [
  ["@jsquash/webp/codec/enc/webp_enc.js", "webp/webp_enc.js"],
  ["@jsquash/webp/codec/enc/webp_enc.wasm", "webp/webp_enc.wasm"],
  ["@jsquash/webp/meta.js", "webp/meta.js"],
  ["@jsquash/webp/LICENSE", "webp/LICENSE"],
  ["@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2", "fonts/jetbrains-mono.woff2"],
  ["@fontsource-variable/jetbrains-mono/LICENSE", "fonts/LICENSE"],
];

for (const [de, a] of COPIAS) {
  const destino = new URL(`../public/vendor/${a}`, import.meta.url);
  mkdirSync(new URL(".", destino), { recursive: true });
  cpSync(new URL(`../node_modules/${de}`, import.meta.url), destino);
  console.log(`public/vendor/${a}`);
}
