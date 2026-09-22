import { beforeAll, describe, expect, it } from "vitest";
import { clave, conSesion, entrar, pedir } from "./ayuda";

let id: number;

beforeAll(async () => {
  const api = conSesion(await entrar());
  const res = await api("/api/paellas", {
    method: "POST",
    body: {
      titulo: 'la del "domingo" <b>',
      descripcion: "con alcachofas",
      r2_key: clave(),
      size: 1200,
      notas: { punto_arroz: 9, sabor_caldo: 9, socarrat: 9, sinergia: 9 },
    },
  });
  id = ((await res.json()) as { id: number }).id;
});

describe("la ficha /p/:id", () => {
  it("lleva la vista previa rellena, con el texto escapado", async () => {
    const res = await pedir(`/p/${id}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // Dentro de un atributo basta con escapar las comillas; en el texto, el <.
    expect(html).toContain('<meta property="og:title" content="la del &quot;domingo&quot; <b>"');
    expect(html).toContain("9/10 · de las que se recuerdan — con alcachofas");
    expect(html).toMatch(/og:image" content="https:\/\/paellas\.party\/r2\/fotos\//);
    expect(html).toContain('<title>la del "domingo" &lt;b&gt; — paellas.party</title>');
  });

  it("una paella que no existe se sirve con 404", async () => {
    expect((await pedir("/p/99999")).status).toBe(404);
  });
});

describe("cabeceras", () => {
  it("las páginas llevan la CSP", async () => {
    const res = await pedir("/");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it("sw.js se sirve con la versión del despliegue dentro", async () => {
    const js = await (await pedir("/sw.js")).text();
    expect(js).not.toContain("'__VERSION__'");
    expect(js).toMatch(/const VERSION = "[^"]+";/);
  });

  it("/subir sin sesión manda al login", async () => {
    const res = await pedir("/subir");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/entrar");
  });
});
