import { describe, it, expect } from "vitest";
import {
  centeredOffsets,
  clampOffset,
  coverScale,
  cropFromView,
  maxZoom,
  outputSide,
  zoomAround,
} from "../public/js/geom.js";

describe("coverScale", () => {
  it("escala por el lado corto (la foto cubre el escenario)", () => {
    // Foto apaisada 4000x3000 en un escenario de 300: manda el alto.
    expect(coverScale(4000, 3000, 300)).toBeCloseTo(0.1);
    // Foto vertical 3000x4000: manda el ancho.
    expect(coverScale(3000, 4000, 300)).toBeCloseTo(0.1);
  });
});

describe("clampOffset", () => {
  it("no deja que asomen bandas vacías por ningún lado", () => {
    expect(clampOffset(50, 400, 300)).toBe(0);      // se pasó por arriba
    expect(clampOffset(-500, 400, 300)).toBe(-100); // se pasó por abajo
    expect(clampOffset(-40, 400, 300)).toBe(-40);   // dentro de rango
  });

  it("si la foto es más pequeña que el escenario, se queda pegada a 0", () => {
    expect(clampOffset(-10, 200, 300)).toBe(0);
  });
});

describe("centeredOffsets", () => {
  it("centra la foto: sobra lo mismo por los dos lados", () => {
    const { ox, oy } = centeredOffsets(3000, 4000, 300, 0.1);
    expect(ox).toBe(0);     // 3000*0.1 = 300, justo
    expect(oy).toBe(-50);   // 4000*0.1 = 400, sobran 100 → 50 por lado
  });
});

describe("zoomAround", () => {
  it("el punto focal se queda quieto al hacer zoom", () => {
    // Con offset -100 y foco en 50, el punto de origen bajo el foco está a 150.
    // Al duplicar la escala debe seguir bajo el foco.
    const nuevo = zoomAround(-100, 50, 2);
    expect(nuevo).toBe(-250);
    expect(50 - nuevo).toBe(300); // 150 * 2
  });

  it("ratio 1 no mueve nada", () => {
    expect(zoomAround(-123, 40, 1)).toBe(-123);
  });
});

describe("maxZoom", () => {
  it("limita el zoom para que el recorte no baje de 400 px de origen", () => {
    expect(maxZoom(3000, 1200)).toBeCloseTo(3);   // 1200/400
    expect(maxZoom(4000, 3000)).toBe(6);          // topado en 6x
    expect(maxZoom(300, 300)).toBe(1);            // foto ya pequeña: sin zoom
  });
});

describe("cropFromView", () => {
  it("sin zoom y centrada, recorta el cuadrado del medio", () => {
    const crop = cropFromView({ iw: 3000, ih: 4000, view: 300, s: 0.1, ox: 0, oy: -50 });
    expect(crop).toEqual({ sx: 0, sy: 500, side: 3000 });
  });

  it("el recorte nunca se sale de la foto", () => {
    const crop = cropFromView({ iw: 3000, ih: 4000, view: 300, s: 0.1, ox: -9999, oy: -9999 });
    expect(crop.sx).toBe(0);           // 3000 de lado: no cabe desplazamiento
    expect(crop.sy).toBe(1000);        // 4000 - 3000
    expect(crop.side).toBe(3000);
  });

  it("con zoom, el lado del recorte se encoge", () => {
    const crop = cropFromView({ iw: 3000, ih: 4000, view: 300, s: 0.2, ox: -100, oy: -200 });
    expect(crop.side).toBe(1500);
    expect(crop.sx).toBe(500);
    expect(crop.sy).toBe(1000);
  });
});

describe("outputSide", () => {
  it("no amplía: si el recorte es pequeño, se guarda tal cual", () => {
    expect(outputSide(800, 1200)).toBe(800);
  });
  it("recorta al objetivo si el recorte es mayor", () => {
    expect(outputSide(3000, 1200)).toBe(1200);
  });
});
