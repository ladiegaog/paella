import { describe, it, expect } from "vitest";
import { formatNota, media, veredicto } from "../../public/js/comun/notas.js";

const notas = (a, b, c, d) => ({
  punto_arroz: a, sabor_caldo: b, socarrat: c, sinergia: d,
});

describe("media", () => {
  it("es la media de las cuatro notas", () => {
    expect(media(notas(8, 9, 7, 9))).toBeCloseTo(8.25);
    expect(media(notas(10, 10, 10, 10))).toBe(10);
    expect(media(notas(0, 0, 0, 0))).toBe(0);
  });

  it("sin ninguna nota puesta → null (la paella no está puntuada)", () => {
    expect(media(notas(null, null, null, null))).toBe(null);
    expect(media({})).toBe(null);
    expect(media(null)).toBe(null);
  });

  it("promedia sólo las notas puestas, no cuenta las vacías como cero", () => {
    expect(media(notas(8, 10, null, null))).toBe(9);
    expect(media(notas(7, null, null, null))).toBe(7);
  });

  it("ignora lo que no sea un entero del 0 al 10", () => {
    expect(media(notas(11, 8, "hola", 8))).toBe(8);
    expect(media(notas(-1, 6, 6, 6))).toBe(6);
    expect(media(notas(7.5, 5, 5, 5))).toBe(5);
  });
});

describe("formatNota", () => {
  it("coma decimal y los enteros sin decimales", () => {
    expect(formatNota(8.25)).toBe("8,3");
    expect(formatNota(9)).toBe("9");
    expect(formatNota(0)).toBe("0");
  });

  it("sin nota se pinta como una raya", () => {
    expect(formatNota(null)).toBe("–");
    expect(formatNota(undefined)).toBe("–");
  });
});

describe("veredicto", () => {
  it("un diez redondo se lleva el mejor", () => {
    expect(veredicto(10)).toBe("para ponerle un marco");
  });

  it("baja de categoría según baja la nota", () => {
    expect(veredicto(9.2)).toBe("de las que se recuerdan");
    expect(veredicto(7.4)).toBe("buena, y repetiría");
    expect(veredicto(5.1)).toBe("se dejó comer");
  });

  it("hay veredicto hasta para un cero", () => {
    expect(veredicto(0)).toBe("esto acabó siendo un arroz caldoso");
  });

  it("sin nota no hay veredicto", () => {
    expect(veredicto(null)).toBe("");
  });
});
