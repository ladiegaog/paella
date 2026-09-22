import { describe, it, expect } from "vitest";
import { extractHashtags, parseHashtagsField } from "../src/hashtags";

describe("extractHashtags", () => {
  it("saca los tags del texto, en minúsculas y sin repetir", () => {
    expect(extractHashtags("hoy #Leña y #marisco, otra vez #leña")).toEqual([
      "leña",
      "marisco",
    ]);
  });

  it("acepta acentos, ñ y guión bajo", () => {
    expect(extractHashtags("#alcachofa #año_nuevo #123")).toEqual([
      "alcachofa",
      "año_nuevo",
      "123",
    ]);
  });

  it("texto vacío o nulo → lista vacía", () => {
    expect(extractHashtags("")).toEqual([]);
    expect(extractHashtags(null)).toEqual([]);
    expect(extractHashtags(undefined)).toEqual([]);
  });

  it("una almohadilla suelta no es un tag", () => {
    expect(extractHashtags("precio: 20 # de propina")).toEqual([]);
  });
});

describe("parseHashtagsField", () => {
  it("acepta el campo con almohadillas o sin ellas", () => {
    expect(parseHashtagsField("#leña #marisco")).toEqual(["leña", "marisco"]);
    expect(parseHashtagsField("leña, marisco")).toEqual(["leña", "marisco"]);
  });

  it("normaliza a minúsculas y quita duplicados", () => {
    expect(parseHashtagsField("Leña LEÑA leña")).toEqual(["leña"]);
  });

  it("descarta la puntuación pegada al tag", () => {
    expect(parseHashtagsField("#domingo! #playa.")).toEqual(["domingo", "playa"]);
  });

  it("campo vacío → lista vacía", () => {
    expect(parseHashtagsField("   ")).toEqual([]);
    expect(parseHashtagsField(null)).toEqual([]);
  });
});
