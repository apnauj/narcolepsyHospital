// Tests de tilePainter y del fallback a cuadritos.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tilePainter } from "../js/art/tilePainter.js";
import { createStageArt, resetArtCache } from "../js/art/stage.js";
import { SpriteRenderer } from "../js/art/spriteRenderer.js";
import { SquareRenderer } from "../js/entities/squareRenderer.js";
import { objectFor, tileFor } from "../js/art/sheets.js";
import { TILE } from "../js/world/tiles.js";
import { fakeArt, fakeCtx, manifest } from "./art-fixtures.js";

const art = fakeArt();
const tilesSheet = manifest.tiles.sheet;

test("dibuja un tile del manifest por cada TILE", () => {
  const painter = tilePainter(art);
  for (const [name, v] of Object.entries(TILE)) {
    const ctx = fakeCtx();
    painter(ctx, v, 32, 48, 2, 3);
    assert.equal(ctx.calls[0]?.path, tilesSheet, `TILE.${name} no dibujó nada`);
    const want = tileFor(art, art.tiles.byType[name] ?? "piso");
    if (name !== "WALL" && name !== "SEA") { // el mar cambia a mar-orilla según el vecino (test aparte)
      assert.equal(ctx.calls[0].sx, want.x, name);
      assert.equal(ctx.calls[0].sy, want.y, name);
    }
    assert.equal(ctx.calls[0].dx, 32);
    assert.equal(ctx.calls[0].dy, 48);
  }
});

test("el muro muestra la cara si debajo no hay muro y el tope si lo hay", () => {
  const cols = 1;
  const world = { cols, rows: 3, tiles: Uint8Array.from([TILE.WALL, TILE.WALL, TILE.FLOOR]) };
  const painter = tilePainter(art, world);
  const sx = (ty) => {
    const ctx = fakeCtx();
    painter(ctx, TILE.WALL, 0, ty * 16, 0, ty);
    return ctx.calls[0].sx;
  };
  assert.equal(sx(0), art.tiles.tiles["pared-tope"].x);
  assert.equal(sx(1), art.tiles.tiles.pared.x);
});

test("decor: el piso de `under` va antes que el mueble, con su origin", () => {
  const painter = tilePainter(art);
  const d = { tx: 4, ty: 2, kind: "fridge", under: TILE.FLOOR };
  const ctx = fakeCtx();
  painter.decor(ctx, d, 64, 32);
  assert.equal(ctx.calls.length, 2);
  assert.equal(ctx.calls[0].path, tilesSheet);
  const sprite = objectFor(art, d);
  assert.equal(ctx.calls[1].path, sprite.sheet);
  assert.equal(ctx.calls[1].dx, 64 - sprite.origin.x);
  assert.equal(ctx.calls[1].dy, 32 - sprite.origin.y);
});

test("decor: huella grande pone un piso por tile y `repeat` repite el sprite", () => {
  const painter = tilePainter(art);
  const ctx = fakeCtx();
  painter.decor(ctx, { tx: 0, ty: 0, kind: "counter", w: 3, h: 1, under: TILE.FLOOR }, 0, 0);
  const sprites = ctx.calls.filter((c) => c.path !== tilesSheet);
  assert.equal(ctx.calls.filter((c) => c.path === tilesSheet).length, 3);
  assert.deepEqual(sprites.map((c) => c.dx), [0, 16, 32]);
});

test("decor animado: frame 0 estático; el ventilador va solo como eje en el overlay", () => {
  const painter = tilePainter(art);
  const ctx = fakeCtx();
  painter.decor(ctx, { tx: 1, ty: 1, kind: "tv", facing: "down" }, 16, 16);
  assert.equal(ctx.calls[0].sx, manifest.objects.tv.x);
  const fan = { tx: 3, ty: 3, kind: "fan" };
  const c2 = fakeCtx();
  painter.decor(c2, fan, 48, 48);
  assert.equal(c2.calls.length, 0, "el ventilador no se pinta en el pase normal");
  const world = { cols: 10, rows: 10, decor: [fan], tiles: new Uint8Array(100) };
  const camera = { offsetX: 0, offsetY: 0, zoom: 1, visibleW: 160, visibleH: 160 };
  const c3 = fakeCtx();
  painter.drawOverlay(c3, world, camera);
  assert.equal(c3.calls.length, 1);
  assert.equal(c3.calls[0].sw, 6);
});

test("overlay: la copa de la palmera se repinta sobre los personajes", () => {
  const painter = tilePainter(art);
  const palm = { tx: 4, ty: 4, kind: "palm", under: TILE.GRASS };
  const world = { cols: 10, rows: 10, decor: [palm], tiles: new Uint8Array(100) };
  const camera = { offsetX: 0, offsetY: 0, zoom: 1, visibleW: 160, visibleH: 160 };
  const ctx = fakeCtx();
  painter.drawOverlay(ctx, world, camera);
  const sprite = objectFor(art, palm);
  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].sh, sprite.origin.y, "solo lo que sobresale de la huella");
});

test("overlay: las camas no se repintan encima del paciente (bed:up sobresale)", () => {
  const painter = tilePainter(art);
  const world = { cols: 10, rows: 10, decor: [{ tx: 4, ty: 4, kind: "bed", dir: "up", under: TILE.ROOM_FLOOR }], tiles: new Uint8Array(100) };
  const camera = { offsetX: 0, offsetY: 0, zoom: 1, visibleW: 160, visibleH: 160 };
  const ctx = fakeCtx();
  painter.drawOverlay(ctx, world, camera);
  assert.equal(ctx.calls.length, 0);
});

test("sin arte (loadArt rechaza) cae a cuadritos y colores planos", async () => {
  resetArtCache();
  const warns = [];
  const stage = await createStageArt({}, null, {
    load: () => Promise.reject(new Error("sin red")),
    warn: (...a) => warns.push(a),
  });
  assert.ok(stage.renderer instanceof SquareRenderer);
  assert.equal(stage.painter, null);
  assert.equal(typeof stage.drawWorld, "function");
  assert.equal(warns.length, 1);
  // Con arte: SpriteRenderer y un drawWorld de 3 argumentos.
  resetArtCache();
  const ok = await createStageArt({ decor: [] }, null, { load: async () => art });
  assert.ok(ok.renderer instanceof SpriteRenderer);
  assert.equal(ok.drawWorld.length, 3);
  resetArtCache();
});

test("SAND y SEA tienen tile en el manifest", () => {
  assert.equal(tileFor(art, "SAND").name, "playa");
  assert.equal(tileFor(art, "SEA").name, "mar");
  for (const n of ["playa-orilla", "mar-orilla"]) assert.ok(art.tiles.tiles[n], n);
});

test("playa: el mar con arena debajo lleva espuma; la arena bajo el mar, orilla mojada", () => {
  if (TILE.SEA === undefined || TILE.SAND === undefined) return; // el mundo aún no los define
  const painter = tilePainter(art);
  const cols = 3;
  const tiles = new Uint8Array(cols * 4);
  tiles[0] = TILE.SEA; tiles[cols] = TILE.SEA; tiles[2 * cols] = TILE.SAND; tiles[3 * cols] = TILE.SAND;
  painter.setWorld({ cols, rows: 4, tiles, decor: [] });
  const at = (ty) => {
    const ctx = fakeCtx();
    painter(ctx, tiles[ty * cols], 0, ty * 16, 0, ty);
    return ctx.calls[0];
  };
  assert.equal(at(0).sx, tileFor(art, "mar").x, "mar abierto");
  assert.equal(at(1).sx, tileFor(art, "mar-orilla").x, "mar con espuma");
  assert.equal(at(2).sx, tileFor(art, "playa-orilla").x, "arena mojada");
  assert.equal(at(3).sx, tileFor(art, "playa").x, "arena seca");
});

test("la comida con onTable se dibuja encima de la mesa de su tile", () => {
  const table = { tx: 5, ty: 5, kind: "table", under: TILE.WOOD };
  const food = { tx: 5, ty: 5, kind: "salchipapas", onTable: true };
  const painter = tilePainter(art, { cols: 10, rows: 10, tiles: new Uint8Array(100), decor: [food, table] }); // comida primero a propósito
  const ctx = fakeCtx();
  painter.decor(ctx, food, 80, 80);
  const paths = ctx.calls.map((c) => c.path);
  assert.deepEqual(paths, [objectFor(art, table).sheet, objectFor(art, food).sheet]);
});

test("cancha, sombrilla y concha existen como sprites del manifest", () => {
  const cancha = objectFor(art, { kind: "cancha", w: 8, h: 5 });
  assert.equal(cancha.frame.w, 128);
  assert.equal(cancha.frame.h, 80);
  assert.deepEqual(cancha.footprint, { w: 8, h: 5 });
  for (const k of ["umbrella", "shell", "salchipapas", "cervezaAguila", "arrozCoco"]) {
    assert.ok(objectFor(art, { kind: k }), k);
  }
  // La cancha va debajo de los personajes y no se repinta en el overlay.
  assert.ok(cancha.tags.includes("under"));
});
