// Tests de la cámara y del dibujo del mapa (sin DOM: contexto falso).
import { test } from "node:test";
import assert from "node:assert/strict";

import { Camera, drawWorld, flatPainter, generateWorld, visibleTiles, TILE_SIZE } from "../js/world/index.js";

test("la cámara se limita a los bordes del mundo", () => {
  const cam = new Camera(384, 216, 1000, 800);
  cam.pan(-50, -50);
  assert.deepEqual([cam.x, cam.y], [0, 0]);
  cam.pan(5000, 5000);
  assert.deepEqual([cam.x, cam.y], [1000 - 384, 800 - 216]);
  cam.centerOn(500, 400);
  assert.deepEqual([cam.x, cam.y], [500 - 192, 400 - 108]);
});

test("un mundo más chico que la vista queda centrado", () => {
  const cam = new Camera(384, 216, 200, 100);
  cam.pan(30, 30);
  assert.deepEqual([cam.x, cam.y], [-92, -58]);
});

test("zoom ×2 mantiene el centro y toWorld/toScreen son inversas", () => {
  const cam = new Camera(384, 216, 1000, 800);
  cam.centerOn(500, 400);
  cam.toggleZoom();
  assert.equal(cam.zoom, 2);
  assert.equal(cam.visibleW, 192);
  assert.deepEqual([cam.x + cam.visibleW / 2, cam.y + cam.visibleH / 2], [500, 400]);
  const s = cam.toScreen(510, 420);
  assert.deepEqual(s, { x: (510 - 404) * 2, y: (420 - 346) * 2 });
  assert.deepEqual(cam.toWorld(s.x, s.y), { x: 510, y: 420 });
  cam.setZoom(3); // cualquier otro valor vuelve a ×1
  assert.equal(cam.zoom, 1);
});

test("pan con fracciones no se pierde (arrastres lentos)", () => {
  const cam = new Camera(384, 216, 1000, 800);
  for (let i = 0; i < 9; i++) cam.pan(1 / 3, 0);
  assert.ok(Math.abs(cam.x - 3) < 1e-9);
  assert.equal(cam.offsetX, 3);
});

function fakeContext() {
  const calls = { fillRect: 0, strokeRect: 0 };
  return {
    calls,
    save() {}, restore() {}, translate() {}, scale() {}, fillRect() { calls.fillRect++; },
    strokeRect() { calls.strokeRect++; },
    set fillStyle(v) {}, set strokeStyle(v) {}, set globalAlpha(v) {}, set lineWidth(v) {},
    set imageSmoothingEnabled(v) {},
  };
}

test("drawWorld solo pinta los tiles visibles", () => {
  const world = generateWorld({ rooms: 10 });
  const cam = new Camera(384, 216, world.cols * TILE_SIZE, world.rows * TILE_SIZE);
  cam.centerOn(300, 300);
  const seen = [];
  const painter = (ctx, tile, x, y, tx, ty) => seen.push([tx, ty, x, y, tile]);
  drawWorld(fakeContext(), world, cam, painter);

  const v = visibleTiles(world, cam);
  assert.equal(seen.length, (v.tx1 - v.tx0 + 1) * (v.ty1 - v.ty0 + 1));
  assert.ok(seen.length <= 26 * 15, `${seen.length} tiles`);
  for (const [tx, ty, x, y, tile] of seen) {
    assert.equal(x, tx * TILE_SIZE);
    assert.equal(y, ty * TILE_SIZE);
    assert.equal(tile, world.tiles[ty * world.cols + tx]);
    // Cada tile pintado se ve al menos en parte.
    const s = cam.toScreen(x, y);
    assert.ok(s.x > -TILE_SIZE && s.y > -TILE_SIZE && s.x < 384 && s.y < 216);
  }
});

test("flatPainter dibuja tiles, decoración y bordes sin errores", () => {
  for (const rooms of [2, 9]) {
    const world = generateWorld({ rooms });
    const cam = new Camera(384, 216, world.cols * TILE_SIZE, world.rows * TILE_SIZE);
    const ctx = fakeContext();
    for (let y = 0; y < world.rows * TILE_SIZE; y += 200) {
      for (let x = 0; x < world.cols * TILE_SIZE; x += 300) {
        cam.centerOn(x, y);
        drawWorld(ctx, world, cam, flatPainter);
      }
    }
    assert.ok(ctx.calls.fillRect > 0);
    assert.ok(ctx.calls.strokeRect > 0, "bordes de zona");
  }
  assert.equal(typeof flatPainter.decor, "function");
  assert.equal(typeof flatPainter.zoneBorder, "function");
});
