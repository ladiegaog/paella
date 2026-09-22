import { describe, it, expect } from "vitest";
import { makeToken, timingSafeEqual, verifyToken } from "../src/auth";

describe("timingSafeEqual", () => {
  it("iguales → true; distintas → false", () => {
    expect(timingSafeEqual("secreta", "secreta")).toBe(true);
    expect(timingSafeEqual("secreta", "secretA")).toBe(false);
  });

  it("longitudes distintas → false (sin early-exit que filtre la longitud)", () => {
    expect(timingSafeEqual("corta", "mucho más larga")).toBe(false);
    expect(timingSafeEqual("", "x")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("makeToken / verifyToken", () => {
  const SECRET = "un-secreto-de-test";

  it("un token recién emitido verifica", async () => {
    expect(await verifyToken(SECRET, await makeToken(SECRET))).toBe(true);
  });

  it("un token firmado con otro secreto no verifica", async () => {
    expect(await verifyToken(SECRET, await makeToken("otro"))).toBe(false);
  });

  it("basura, vacío o undefined no verifican", async () => {
    expect(await verifyToken(SECRET, undefined)).toBe(false);
    expect(await verifyToken(SECRET, "")).toBe(false);
    expect(await verifyToken(SECRET, "sinpunto")).toBe(false);
    expect(await verifyToken(SECRET, "123.firmafalsa")).toBe(false);
  });

  it("un token con fecha futura no verifica (edad negativa)", async () => {
    const futuro = Date.now() + 60_000;
    const real = await makeToken(SECRET);
    // Reusamos la firma real pero cambiamos el timestamp: la firma ya no casa.
    expect(await verifyToken(SECRET, `${futuro}.${real.split(".")[1]}`)).toBe(false);
  });
});
