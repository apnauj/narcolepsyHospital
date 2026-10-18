// Tests de A* (web/js/world/astar.js) sobre mundos pequeños hechos a mano.
import { test } from "node:test";
import assert from "node:assert/strict";

import { findPath, generateWorld, TILE, isWalkableTile } from "../js/world/index.js";

// Mundo mínimo desde un dibujo: "#" muro, "." piso.
function gridWorld(lines) {
  const rows = lines.length;
  const cols = lines[0].length;
  const tiles = new Uint8Array(cols * rows);
  lines.forEach((line, y) => {
    for (let x = 0; x < cols; x++) tiles[y * cols + x] = line[x] === "#" ? TILE.WALL : TILE.FLOOR;
  });
  const walkable = (tx, ty) => tx >= 0 && ty >= 0 && tx < cols && ty < rows && isWalkableTile(tiles[ty * cols + tx]);
  return { cols, rows, tiles, walkable };
}

function assertValidPath(world, path, from, to, occupied = new Set()) {
  assert.deepEqual(path[0], from);
  assert.deepEqual(path.at(-1), to);
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1], q = path[i];
    assert.equal(Math.abs(p.tx - q.tx) + Math.abs(p.ty - q.ty), 1, "pasos de 4 vecinos");
    assert.ok(world.walkable(q.tx, q.ty), "solo tiles caminables");
    if (i < path.length - 1) assert.ok(!occupied.has(`${q.tx},${q.ty}`), "evita ocupados");
  }
}

test("camino recto en un cuarto vacío tiene largo Manhattan", () => {
  const w = gridWorld(["......", "......", "......"]);
  const path = findPath(w, { tx: 0, ty: 0 }, { tx: 5, ty: 2 });
  assert.equal(path.length, 5 + 2 + 1);
  assertValidPath(w, path, { tx: 0, ty: 0 }, { tx: 5, ty: 2 });
});

test("rodea obstáculos por el camino más corto", () => {
  const w = gridWorld([
    ".....",
    ".###.",
    ".#...",
    ".#.#.",
    "...#.",
  ]);
  const from = { tx: 2, ty: 2 }, to = { tx: 0, ty: 4 };
  const path = findPath(w, from, to);
  assertValidPath(w, path, from, to);
  assert.equal(path.length, 5); // (2,2)->(2,3)->(2,4)->(1,4)->(0,4)
});

test("mismo origen y destino", () => {
  const w = gridWorld(["..."]);
  assert.deepEqual(findPath(w, { tx: 1, ty: 0 }, { tx: 1, ty: 0 }), [{ tx: 1, ty: 0 }]);
});

test("sin camino devuelve null", () => {
  const w = gridWorld(["..#..", "..#..", "..#.."]);
  assert.equal(findPath(w, { tx: 0, ty: 0 }, { tx: 4, ty: 2 }), null);
  // Destino no caminable o fuera del mapa.
  assert.equal(findPath(w, { tx: 0, ty: 0 }, { tx: 2, ty: 1 }), null);
  assert.equal(findPath(w, { tx: 0, ty: 0 }, { tx: 9, ty: 9 }), null);
});

test("occupied es obstáculo salvo en el destino", () => {
  const w = gridWorld(["...", "...", "..."]);
  const from = { tx: 0, ty: 1 }, to = { tx: 2, ty: 1 };
  const occupied = new Set(["1,1", "2,1"]);
  const path = findPath(w, from, to, { occupied });
  assertValidPath(w, path, from, to, occupied);
  assert.equal(path.length, 5); // da la vuelta por arriba o por abajo
  // Si los ocupados cierran el paso, no hay camino.
  const blocked = gridWorld([".#.", "...", ".#."]);
  assert.equal(findPath(blocked, { tx: 0, ty: 1 }, { tx: 2, ty: 1 }, { occupied: new Set(["1,1"]) }), null);
});

test("la partida puede ser un tile no caminable (levantarse de la cama)", () => {
  const w = gridWorld(["#.."]);
  const path = findPath(w, { tx: 0, ty: 0 }, { tx: 2, ty: 0 });
  assert.deepEqual(path, [{ tx: 0, ty: 0 }, { tx: 1, ty: 0 }, { tx: 2, ty: 0 }]);
});

test("desempate estable: el mismo pedido da siempre el mismo camino", () => {
  const w = gridWorld(["......", "......", "......", "......"]);
  const a = findPath(w, { tx: 0, ty: 0 }, { tx: 5, ty: 3 });
  for (let i = 0; i < 5; i++) assert.deepEqual(findPath(w, { tx: 0, ty: 0 }, { tx: 5, ty: 3 }), a);
});

test("en el mundo grande es rápido y óptimo frente a BFS", () => {
  const w = generateWorld({ rooms: 10 });
  const bfs = (from, to) => {
    const dist = new Int32Array(w.cols * w.rows).fill(-1);
    const q = [from.ty * w.cols + from.tx];
    dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % w.cols, y = (i - x) / w.cols;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * w.cols + x + dx;
        if (w.walkable(x + dx, y + dy) && dist[j] === -1) { dist[j] = dist[i] + 1; q.push(j); }
      }
    }
    return dist[to.ty * w.cols + to.tx];
  };
  const targets = [...w.rooms.map((r) => r.bedside), ...w.pois];
  const t0 = performance.now();
  for (const t of targets) {
    const path = findPath(w, w.spawn, t);
    assert.equal(path.length - 1, bfs(w.spawn, t));
  }
  const ms = (performance.now() - t0) / targets.length;
  assert.ok(ms < 20, `A* tarda ${ms.toFixed(2)} ms por camino`);
});
