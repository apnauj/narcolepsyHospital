// Primitivas de pixel art para los efectos: paleta y glifos dibujados con
// rectángulos de 1 px. Todo en coordenadas enteras para que se vea nítido
// a cualquier escala entera.

import { FLAT_COLORS } from "../world/render.js";

/** Paleta de los efectos: la misma paleta Caribe del mapa. */
export const FX_COLORS = Object.freeze({
  ink: FLAT_COLORS.outline,
  white: FLAT_COLORS.white,
  cream: FLAT_COLORS.floorA,
  red: FLAT_COLORS.red,
  blue: FLAT_COLORS.glass,
  sky: FLAT_COLORS.glassLight,
  sun: FLAT_COLORS.sun,
  leaf: FLAT_COLORS.leaf,
  grass: FLAT_COLORS.grass,
  grassDark: FLAT_COLORS.grassDark,
  dark: FLAT_COLORS.dark,
  steel: FLAT_COLORS.steel,
  mint: FLAT_COLORS.mint,
});

/** Glifos como filas de "0"/"1" (1 = pixel pintado). */
export const GLYPHS = Object.freeze({
  z1: ["111", "010", "111"],
  z2: ["1111", "0010", "0100", "1111"],
  z3: ["11111", "00010", "00100", "01000", "11111"],
  bang: ["11", "11", "11", "11", "11", "00", "11"],
  note: ["0110", "0101", "0100", "0100", "1100", "1100"],
  notes: ["011111", "010001", "010001", "010001", "110011", "110011"],
  spark: ["010", "111", "010"],
});

/** Ancho y alto de un glifo. */
export function glyphSize(name) {
  const rows = GLYPHS[name] ?? [];
  return { w: rows[0]?.length ?? 0, h: rows.length };
}

/** Dibuja un glifo con su esquina superior izquierda en (x, y). */
export function drawGlyph(ctx, name, x, y, color) {
  const rows = GLYPHS[name];
  if (!rows) return;
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    // Une los pixels seguidos de una fila en un solo rectángulo.
    let c = 0;
    while (c < row.length) {
      if (row[c] !== "1") {
        c++;
        continue;
      }
      const start = c;
      while (c < row.length && row[c] === "1") c++;
      ctx.fillRect(x0 + start, y0 + r, c - start, 1);
    }
  }
}

/** Glifo con contorno de 1 px (los 4 vecinos), para que se lea sobre cualquier piso. */
export function drawOutlinedGlyph(ctx, name, x, y, color, outline = FX_COLORS.ink) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawGlyph(ctx, name, x + dx, y + dy, outline);
  drawGlyph(ctx, name, x, y, color);
}

/** Rectángulo de color (atajo). */
export function rect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Hash entero determinista (para variar sin aleatoriedad). */
export function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
