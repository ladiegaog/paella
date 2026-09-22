import { describe, it, expect } from "vitest";
import { validatePaellaBody } from "../../src/validate";

const KEY_OK = "fotos/26/09/0123456789abcdef01234567.webp";

describe("validatePaellaBody", () => {
  it("un body completo pasa y normaliza los tags", () => {
    const v = validatePaellaBody(
      {
        titulo: "  Paella de conejo  ",
        descripcion: "salió #buenísima",
        hashtags: "#leña, marisco",
        r2_key: KEY_OK,
        size: 1200,
      },
      true,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.titulo).toBe("Paella de conejo");
    expect(v.tags.sort()).toEqual(["buenísima", "leña", "marisco"]);
    expect(v.size).toBe(1200);
  });

  it("sin título no pasa", () => {
    expect(validatePaellaBody({ titulo: "   ", r2_key: KEY_OK }, true)).toMatchObject({
      ok: false,
    });
  });

  it("al crear, la foto es obligatoria; al editar, no", () => {
    expect(validatePaellaBody({ titulo: "sin foto" }, true).ok).toBe(false);
    expect(validatePaellaBody({ titulo: "sin foto" }, false).ok).toBe(true);
  });

  it("rechaza una r2_key que no tenga la forma que escribe el worker", () => {
    for (const key of [
      "../../secreto.webp",
      "/fotos/26/09/0123456789abcdef01234567.webp",
      "otracarpeta/26/09/0123456789abcdef01234567.webp",
      "fotos/26/09/NOHEX.webp",
    ]) {
      expect(validatePaellaBody({ titulo: "t", r2_key: key }, true).ok).toBe(false);
    }
  });

  it("descripción vacía → null, y una demasiado larga no pasa", () => {
    const vacia = validatePaellaBody({ titulo: "t", descripcion: "  ", r2_key: KEY_OK }, true);
    expect(vacia.ok && vacia.descripcion).toBe(null);
    const larga = validatePaellaBody(
      { titulo: "t", descripcion: "x".repeat(2001), r2_key: KEY_OK },
      true,
    );
    expect(larga.ok).toBe(false);
  });

  it("el título se trunca a 120 caracteres", () => {
    const v = validatePaellaBody({ titulo: "a".repeat(200), r2_key: KEY_OK }, true);
    expect(v.ok && v.titulo.length).toBe(120);
  });

  it("un size que no es un entero positivo se guarda como null", () => {
    const v = validatePaellaBody({ titulo: "t", r2_key: KEY_OK, size: -3 }, true);
    expect(v.ok && v.size).toBe(null);
  });
});

describe("validatePaellaBody — puntuación", () => {
  const base = { titulo: "t", r2_key: KEY_OK };

  it("acepta las cuatro notas del 0 al 10", () => {
    const v = validatePaellaBody(
      { ...base, notas: { punto_arroz: 8, sabor_caldo: 9, socarrat: 0, sinergia: 10 } },
      true,
    );
    expect(v.ok && v.notas).toEqual({
      punto_arroz: 8, sabor_caldo: 9, socarrat: 0, sinergia: 10,
    });
  });

  it("sin notas, las cuatro quedan a null (paella sin puntuar)", () => {
    const v = validatePaellaBody(base, true);
    expect(v.ok && v.notas).toEqual({
      punto_arroz: null, sabor_caldo: null, socarrat: null, sinergia: null,
    });
  });

  it("se pueden puntuar sólo algunas", () => {
    const v = validatePaellaBody({ ...base, notas: { socarrat: 9 } }, true);
    expect(v.ok && v.notas.socarrat).toBe(9);
    expect(v.ok && v.notas.punto_arroz).toBe(null);
  });

  it("rechaza una nota fuera de rango o que no sea entera, en vez de recortarla", () => {
    for (const mala of [11, -1, 7.5, "nueve", {}]) {
      expect(validatePaellaBody({ ...base, notas: { socarrat: mala } }, true).ok).toBe(false);
    }
  });
});

describe("validatePaellaBody — galería", () => {
  const base = { titulo: "t", r2_key: KEY_OK };
  const OTRA = "fotos/26/09/89abcdef0123456789abcdef.webp";

  it("sin campo `fotos` devuelve null: la galería no se toca al editar", () => {
    const v = validatePaellaBody(base, true);
    expect(v.ok && v.fotos).toBe(null);
  });

  it("un array vacío sí es 'quita todas las fotos'", () => {
    const v = validatePaellaBody({ ...base, fotos: [] }, true);
    expect(v.ok && v.fotos).toEqual([]);
  });

  it("conserva el orden y normaliza las medidas", () => {
    const v = validatePaellaBody(
      { ...base, fotos: [{ r2_key: OTRA, width: 1600, height: 1200 }, { r2_key: KEY_OK }] },
      true,
    );
    expect(v.ok && v.fotos).toEqual([
      { r2_key: OTRA, width: 1600, height: 1200 },
      { r2_key: KEY_OK, width: null, height: null },
    ]);
  });

  it("rechaza una clave de foto que no tenga la forma que escribe el worker", () => {
    const v = validatePaellaBody({ ...base, fotos: [{ r2_key: "../../secreto.webp" }] }, true);
    expect(v.ok).toBe(false);
  });

  it("rechaza más de 20 fotos", () => {
    const muchas = Array.from({ length: 21 }, () => ({ r2_key: OTRA }));
    expect(validatePaellaBody({ ...base, fotos: muchas }, true).ok).toBe(false);
  });
});
