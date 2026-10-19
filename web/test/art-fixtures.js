// Ayudas de los tests del arte: contexto 2D falso que registra las llamadas e
// imágenes falsas (en Node no hay Image). El arte sale del manifest real.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeArt, sheetPaths } from "../js/art/sheets.js";

const here = dirname(fileURLToPath(import.meta.url));
export const manifest = JSON.parse(readFileSync(join(here, "..", "assets", "sprites.json"), "utf8"));

/** Arte con una "imagen" falsa por hoja: { path }. */
export function fakeArt() {
  const images = new Map(sheetPaths(manifest).map((p) => [p, { path: p }]));
  return makeArt(manifest, images);
}

/** Contexto 2D que anota cada drawImage con la matriz de transformación activa. */
export function fakeCtx() {
  const calls = [];
  let m = { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 };
  const stack = [];
  const ctx = {
    calls,
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    save() { stack.push({ ...m }); },
    restore() { m = stack.pop(); },
    translate(x, y) { m.tx += x * m.sx; m.ty += y * m.sy; },
    scale(x, y) { m.sx *= x; m.sy *= y; },
    rotate(a) { m.rot += a; },
    fillRect() {},
    strokeRect() {},
    drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
      calls.push({ path: img.path, sx, sy, sw, sh, dx, dy, dw, dh, alpha: ctx.globalAlpha, m: { ...m } });
    },
  };
  return ctx;
}

export const entity = (over = {}) => ({
  kind: "patient", id: "P-1", dir: "down", anim: "idle", animTime: 0, flags: { alert: false }, ...over,
});
