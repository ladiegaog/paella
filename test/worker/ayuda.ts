import { exports } from "cloudflare:workers";

// Helpers de los tests del Worker: hablar con él como lo haría el navegador.

const ORIGEN = "https://paellas.party";

export const pedir = (path: string, init?: RequestInit) =>
  exports.default.fetch(new Request(`${ORIGEN}${path}`, { redirect: "manual", ...init }));

// Entra con el usuario y la contraseña de test y devuelve la cookie de sesión.
export async function entrar(): Promise<string> {
  const res = await pedir("/api/login", {
    method: "POST",
    body: new URLSearchParams({ usuario: "ladiega", password: "contraseña-de-test" }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`login sin cookie (${res.status})`);
  return cookie;
}

// Una petición con sesión y con el header CSRF, como las que hace api.js.
export function conSesion(cookie: string) {
  return (path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}) =>
    pedir(path, {
      method,
      headers: {
        cookie,
        "x-paella-csrf": "1",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
}

// Claves de R2 con la forma que escribe el Worker (no hace falta que existan
// en el bucket: la paella sólo guarda la referencia).
let n = 0;
export const clave = () => `fotos/26/09/${(++n).toString(16).padStart(24, "0")}.webp`;
