import { describe, it, expect } from "vitest";
import { validatePaellaBody } from "../src/index";

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
