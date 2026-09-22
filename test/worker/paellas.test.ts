import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createPaella } from "../../src/db";
import { clave, conSesion, entrar, pedir } from "./ayuda";

let api: ReturnType<typeof conSesion>;

beforeAll(async () => {
  api = conSesion(await entrar());
});

async function crear(body: Record<string, unknown>) {
  const res = await api("/api/paellas", { method: "POST", body: { r2_key: clave(), ...body } });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: number; hashtags: string[]; fotos: { r2_key: string }[] };
}

describe("crear y leer", () => {
  it("guarda la paella con sus tags (los del campo y los del texto) y su galería", async () => {
    const fotos = [{ r2_key: clave(), width: 1600, height: 1200 }, { r2_key: clave() }];
    const p = await crear({
      titulo: "de conejo #leña",
      hashtags: "#domingo",
      notas: { socarrat: 9 },
      fotos,
    });
    const res = await pedir(`/api/paellas/${p.id}`);
    const leida = (await res.json()) as Record<string, unknown> & typeof p;
    expect(leida.hashtags).toEqual(["domingo", "leña"]);
    expect(leida.fotos.map((f) => f.r2_key)).toEqual(fotos.map((f) => f.r2_key));
    expect(leida.socarrat).toBe(9);
    expect(leida.punto_arroz).toBe(null);
  });

  it("si falla una parte, no se guarda nada (el batch es una transacción)", async () => {
    const antes = await env.DB.prepare("SELECT COUNT(*) AS n FROM paellas").first<{ n: number }>();
    await expect(
      createPaella(env.DB, {
        titulo: "a medias",
        descripcion: null,
        r2_key: clave(),
        size: null,
        notas: { punto_arroz: null, sabor_caldo: null, socarrat: null, sinergia: null },
        tags: ["huérfano"],
        // r2_key es NOT NULL: esta fila hace fallar el batch después de haber
        // insertado ya la paella y su tag.
        fotos: [{ r2_key: null as unknown as string, width: null, height: null }],
      }),
    ).rejects.toThrow();
    const despues = await env.DB.prepare("SELECT COUNT(*) AS n FROM paellas").first<{ n: number }>();
    expect(despues!.n).toBe(antes!.n);
    const tag = await env.DB.prepare("SELECT 1 FROM hashtags WHERE tag = 'huérfano'").first();
    expect(tag).toBe(null);
  });
});

describe("editar", () => {
  it("sin `fotos` deja la galería como estaba; con [] la vacía", async () => {
    const p = await crear({ titulo: "t", fotos: [{ r2_key: clave() }] });

    let res = await api(`/api/paellas/${p.id}`, { method: "PATCH", body: { titulo: "otro" } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as typeof p).fotos).toHaveLength(1);

    res = await api(`/api/paellas/${p.id}`, { method: "PATCH", body: { titulo: "otro", fotos: [] } });
    expect(((await res.json()) as typeof p).fotos).toHaveLength(0);
  });

  it("cambia los tags por los nuevos", async () => {
    const p = await crear({ titulo: "t", hashtags: "#viejo" });
    const res = await api(`/api/paellas/${p.id}`, {
      method: "PATCH",
      body: { titulo: "t", hashtags: "#nuevo" },
    });
    expect(((await res.json()) as typeof p).hashtags).toEqual(["nuevo"]);
  });

  it("una paella que no existe o está borrada da 404", async () => {
    expect((await api("/api/paellas/99999", { method: "PATCH", body: { titulo: "t" } })).status).toBe(404);
    const p = await crear({ titulo: "t" });
    await api(`/api/paellas/${p.id}`, { method: "DELETE" });
    expect((await api(`/api/paellas/${p.id}`, { method: "PATCH", body: { titulo: "t" } })).status).toBe(404);
  });
});

describe("la lista", () => {
  it("se recorre entera con el cursor, de la más nueva a la más vieja, sin repetir", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) ids.push((await crear({ titulo: `lista ${i}`, hashtags: "#paginar" })).id);

    const vistos: number[] = [];
    let cursor: string | null = null;
    do {
      const qs = new URLSearchParams({ tag: "paginar", limit: "2", ...(cursor ? { cursor } : {}) });
      const res = await pedir(`/api/paellas?${qs}`);
      const data = (await res.json()) as { paellas: { id: number }[]; nextCursor: string | null };
      vistos.push(...data.paellas.map((p) => p.id));
      cursor = data.nextCursor;
    } while (cursor);

    expect(vistos).toEqual([...ids].reverse());
  });

  it("borrar la quita de la lista y de las cuentas de hashtags, pero no de la copia", async () => {
    const p = await crear({ titulo: "para borrar", hashtags: "#efimera" });
    expect((await api(`/api/paellas/${p.id}`, { method: "DELETE" })).status).toBe(200);

    const lista = (await (await pedir("/api/paellas?tag=efimera")).json()) as { paellas: unknown[] };
    expect(lista.paellas).toHaveLength(0);
    const tags = (await (await pedir("/api/hashtags")).json()) as { tag: string }[];
    expect(tags.map((t) => t.tag)).not.toContain("efimera");

    const copia = (await (await api("/api/export")).json()) as {
      paellas: { id: number; deleted_at: string | null }[];
    };
    expect(copia.paellas.find((x) => x.id === p.id)?.deleted_at).toBeTruthy();
  });
});

describe("las fotos", () => {
  it("se suben crudas y se sirven desde /r2/ con caché para siempre", async () => {
    const cookie = await entrar();
    const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    const res = await pedir("/api/upload", {
      method: "POST",
      headers: { cookie, "x-paella-csrf": "1", "content-type": "image/webp" },
      body: bytes,
    });
    expect(res.status).toBe(200);
    const { key, url } = (await res.json()) as { key: string; url: string };
    expect(key).toMatch(/^fotos\/\d{2}\/\d{2}\/[0-9a-f]{24}\.webp$/);

    const foto = await pedir(url);
    expect(foto.headers.get("content-type")).toBe("image/webp");
    expect(foto.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await foto.arrayBuffer())).toEqual(bytes);
  });

  it("un tipo que no es imagen no se acepta", async () => {
    const cookie = await entrar();
    const res = await pedir("/api/upload", {
      method: "POST",
      headers: { cookie, "x-paella-csrf": "1", "content-type": "image/svg+xml" },
      body: "<svg/>",
    });
    expect(res.status).toBe(400);
  });
});

describe("cerrojos", () => {
  it("sin sesión no se escribe", async () => {
    const res = await pedir("/api/paellas", {
      method: "POST",
      headers: { "x-paella-csrf": "1", "content-type": "application/json" },
      body: JSON.stringify({ titulo: "t", r2_key: clave() }),
    });
    expect(res.status).toBe(401);
  });

  it("con sesión pero sin el header CSRF, tampoco", async () => {
    const cookie = await entrar();
    const res = await pedir("/api/paellas", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ titulo: "t", r2_key: clave() }),
    });
    expect(res.status).toBe(403);
  });

  it("una contraseña mala vuelve al login con el error", async () => {
    const res = await pedir("/api/login", {
      method: "POST",
      body: new URLSearchParams({ usuario: "ladiega", password: "no" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/entrar?e=1");
  });
});

describe("el límite de intentos del login", () => {
  it("después de 10 intentos en un minuto, vuelve al login avisando de que espere", async () => {
    // Una IP propia: el límite es por IP y así no bloquea al resto de tests.
    const intento = () =>
      pedir("/api/login", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.7" },
        body: new URLSearchParams({ usuario: "ladiega", password: "no" }),
      });
    for (let i = 0; i < 10; i++) {
      expect((await intento()).headers.get("location")).toBe("/entrar?e=1");
    }
    expect((await intento()).headers.get("location")).toBe("/entrar?e=espera");
  });
});
