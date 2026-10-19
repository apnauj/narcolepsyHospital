// Tests del generador de mapas (web/js/world/generator.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  generateWorld, zoneAt, roomAt, rectContains, findPath, TILE, isWalkableTile, WING_LOCATIONS,
} from "../js/world/index.js";

const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];

// Nombres válidos de hospital.Location, leídos del código Go para no desincronizarse.
const GO_LOCATIONS = (() => {
  const src = readFileSync(new URL("../../hospital/location.go", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("names := [...]string{"));
  return new Set([...block.slice(0, block.indexOf("}")).matchAll(/"([^"]+)"/g)].map((m) => m[1]));
})();

const FIXED_LOCATIONS = [
  "Main Entrance", "Reception", "Waiting Room", "Cafeteria",
  "Main Hallway", "Administrative Block", "Maintenance Area",
];

function expectedLocations(n) {
  const wings = WING_LOCATIONS.slice(0, Math.ceil(n / 2));
  return [...FIXED_LOCATIONS, ...wings, ...(n % 2 === 1 ? ["Sterilization Unit"] : [])];
}

const worlds = new Map(SIZES.map((n) => [n, generateWorld({ rooms: n })]));

const tileAt = (w, p) => w.tiles[p.ty * w.cols + p.tx];
const adjacent = (p, q) => Math.abs(p.tx - q.tx) + Math.abs(p.ty - q.ty) === 1;

test("rechaza tamaños fuera de 2..10", () => {
  for (const rooms of [undefined, 1, 11, 2.5, "4"]) {
    assert.throws(() => generateWorld({ rooms }), RangeError);
  }
});

test("forma del World del contrato", () => {
  for (const [n, w] of worlds) {
    assert.ok(w.tiles instanceof Uint8Array, `N=${n}`);
    assert.equal(w.tiles.length, w.cols * w.rows);
    assert.equal(typeof w.walkable, "function");
    for (const key of ["zones", "rooms", "pois", "robotBase", "decor"]) assert.ok(Array.isArray(w[key]), key);
    assert.ok(w.spawn && w.staffRoom?.rect);
    assert.equal(w.robotBase.length, 3, `N=${n}: 3 puestos de carga`);
    assert.ok(w.walkable(w.spawn.tx, w.spawn.ty));
    assert.equal(zoneAt(w, w.spawn.tx, w.spawn.ty)?.location, "Main Entrance");
    assert.equal(w.walkable(-1, 0), false);
    assert.equal(w.walkable(w.cols, 0), false);
  }
});

test("número de habitaciones y numeración 101..", () => {
  for (const [n, w] of worlds) {
    assert.deepEqual(w.rooms.map((r) => r.number), Array.from({ length: n }, (_, i) => 101 + i), `N=${n}`);
  }
});

test("habitaciones: puerta caminable, cama sólida y bedside junto a la cama", () => {
  for (const [n, w] of worlds) {
    for (const r of w.rooms) {
      const at = `N=${n} hab ${r.number}`;
      assert.equal(tileAt(w, r.door), TILE.DOOR, at);
      assert.ok(w.walkable(r.door.tx, r.door.ty), at);
      assert.equal(tileAt(w, r.bed), TILE.BED, at);
      assert.equal(w.walkable(r.bed.tx, r.bed.ty), false, at);
      assert.ok(w.walkable(r.bedside.tx, r.bedside.ty), at);
      assert.ok(adjacent(r.bed, r.bedside), `${at}: bedside al lado de la cama`);
      assert.ok(rectContains(r.rect, r.bed.tx, r.bed.ty) && rectContains(r.rect, r.bedside.tx, r.bedside.ty), at);
      assert.ok(!rectContains(r.rect, r.door.tx, r.door.ty), `${at}: la puerta está en el muro`);
      assert.equal(roomAt(w, r.bedside.tx, r.bedside.ty), r, at);
      // La puerta da a un pasillo de ala.
      const hallway = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => zoneAt(w, r.door.tx + dx, r.door.ty + dy))
        .find((z) => z);
      assert.ok(WING_LOCATIONS.includes(hallway?.location), `${at}: puerta al pasillo (${hallway?.location})`);
    }
  }
});

test("todas las zonas del contrato con nombres exactos de hospital.Location", () => {
  for (const [n, w] of worlds) {
    const locations = w.zones.map((z) => z.location);
    assert.deepEqual([...locations].sort(), expectedLocations(n).sort(), `N=${n}`);
    assert.equal(new Set(locations).size, locations.length, `N=${n}: sin zonas repetidas`);
    for (const z of w.zones) {
      assert.ok(GO_LOCATIONS.has(z.location), `"${z.location}" no existe en hospital/location.go`);
      assert.equal(typeof z.name, "string");
      assert.ok(z.name.length > 0);
    }
  }
});

test("las alas usan los pasillos en orden", () => {
  for (const [n, w] of worlds) {
    const wings = w.zones.map((z) => z.location).filter((l) => WING_LOCATIONS.includes(l));
    assert.deepEqual(wings, WING_LOCATIONS.slice(0, Math.ceil(n / 2)), `N=${n}`);
  }
});

test("zoneAt es coherente con los rectángulos", () => {
  for (const [n, w] of worlds) {
    // Las zonas no se solapan y caen dentro del mapa.
    for (const z of w.zones) {
      const r = z.rect;
      assert.ok(r.tx >= 0 && r.ty >= 0 && r.tx + r.w <= w.cols && r.ty + r.h <= w.rows, `N=${n} ${z.location}`);
      for (let ty = r.ty; ty < r.ty + r.h; ty++) {
        for (let tx = r.tx; tx < r.tx + r.w; tx++) {
          assert.equal(zoneAt(w, tx, ty), z, `N=${n} (${tx},${ty}) en ${z.location}`);
          assert.equal(roomAt(w, tx, ty), null, `N=${n}: zona y habitación no se mezclan`);
        }
      }
    }
    // Todo tile caminable que no es puerta ni habitación pertenece a una zona.
    for (let ty = 0; ty < w.rows; ty++) {
      for (let tx = 0; tx < w.cols; tx++) {
        const t = w.tiles[ty * w.cols + tx];
        if (!isWalkableTile(t) || t === TILE.DOOR || roomAt(w, tx, ty)) continue;
        assert.ok(zoneAt(w, tx, ty), `N=${n}: (${tx},${ty}) caminable sin zona`);
      }
    }
    assert.equal(zoneAt(w, 0, 0), null);
    assert.equal(zoneAt(w, -5, -5), null);
    // La base de camillas y la sala de personal están en su zona.
    for (const p of w.robotBase) assert.equal(zoneAt(w, p.tx, p.ty)?.location, "Maintenance Area");
    const sr = w.staffRoom.rect;
    assert.equal(zoneAt(w, sr.tx, sr.ty)?.location, "Administrative Block");
  }
});

test("pois y decor válidos", () => {
  for (const [n, w] of worlds) {
    const kinds = new Set(w.pois.map((p) => p.kind));
    for (const k of ["tv", "water", "window", "chair", "coffee"]) assert.ok(kinds.has(k), `N=${n}: falta poi ${k}`);
    for (const p of w.pois) {
      assert.ok(w.walkable(p.tx, p.ty), `N=${n}: poi ${p.kind} en (${p.tx},${p.ty}) no caminable`);
      assert.ok(zoneAt(w, p.tx, p.ty), `N=${n}: poi ${p.kind} fuera de zona (los pacientes no entran a cuartos)`);
      if (p.kind === "window") {
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.tiles[(p.ty + dy) * w.cols + p.tx + dx] === TILE.WINDOW);
        assert.ok(near, `N=${n}: poi window sin ventana al lado`);
      }
    }
    const decor = new Set(w.decor.map((d) => d.kind));
    for (const k of ["palm", "sign", "chair", "tv", "pico", "mural", "coffeeCart", "hammock", "fridge", "board",
      "fan", "plant", "water", "extinguisher", "noSleepSign", "doorNumber", "monitor", "nightstand", "charger"]) {
      assert.ok(decor.has(k), `N=${n}: falta decor ${k}`);
    }
    const numbers = w.decor.filter((d) => d.kind === "doorNumber").map((d) => d.label);
    assert.deepEqual(numbers.sort(), w.rooms.map((r) => String(r.number)).sort());
    for (const d of w.decor) {
      assert.ok(d.tx >= 0 && d.ty >= 0 && d.tx < w.cols && d.ty < w.rows, `N=${n}: decor ${d.kind} fuera`);
    }
  }
});

test("conectividad: desde la entrada se llega a todo", () => {
  for (const [n, w] of worlds) {
    const targets = [
      ...w.rooms.flatMap((r) => [["door " + r.number, r.door], ["bedside " + r.number, r.bedside]]),
      ...w.pois.map((p) => ["poi " + p.kind, p]),
      ...w.robotBase.map((p) => ["robotBase", p]),
      ["staffRoom", { tx: w.staffRoom.rect.tx + 2, ty: w.staffRoom.rect.ty + 2 }],
    ];
    for (const [what, p] of targets) {
      const path = findPath(w, w.spawn, p);
      assert.ok(path, `N=${n}: sin camino a ${what} (${p.tx},${p.ty})`);
      assert.deepEqual(path.at(-1), { tx: p.tx, ty: p.ty });
    }

    // Además, todo tile caminable está en la misma componente que la entrada.
    const seen = new Uint8Array(w.cols * w.rows);
    const stack = [w.spawn.ty * w.cols + w.spawn.tx];
    seen[stack[0]] = 1;
    let reached = 0;
    while (stack.length) {
      const i = stack.pop();
      reached++;
      const x = i % w.cols, y = (i - x) / w.cols;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * w.cols + (x + dx);
        if (w.walkable(x + dx, y + dy) && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    const total = w.tiles.reduce((acc, t) => acc + (isWalkableTile(t) ? 1 : 0), 0);
    assert.equal(reached, total, `N=${n}: hay tiles caminables aislados`);
  }
});

test("el borde del mapa es jardín (no se sale del mundo)", () => {
  for (const [n, w] of worlds) {
    for (let tx = 0; tx < w.cols; tx++) {
      assert.equal(w.walkable(tx, 0) || w.walkable(tx, w.rows - 1), false, `N=${n}`);
    }
    for (let ty = 0; ty < w.rows; ty++) {
      assert.equal(w.walkable(0, ty) || w.walkable(w.cols - 1, ty), false, `N=${n}`);
    }
  }
});

test("determinismo: dos llamadas dan el mismo mundo", () => {
  for (const n of SIZES) {
    const a = generateWorld({ rooms: n });
    const b = generateWorld({ rooms: n });
    assert.deepEqual(a.tiles, b.tiles, `N=${n}`);
    const strip = (w) => JSON.stringify({ ...w, tiles: undefined, walkable: undefined });
    assert.equal(strip(a), strip(b), `N=${n}`);
  }
});

test("con N > 6 las alas hacen L o U y el mapa no es un tubo", () => {
  const ratioOf = (w) => Math.max(w.cols, w.rows) / Math.min(w.cols, w.rows);
  const six = worlds.get(6);
  for (const [n, w] of worlds) {
    const ratio = ratioOf(w);
    assert.ok(ratio <= 1.8, `N=${n}: ${w.cols}×${w.rows} (relación ${ratio.toFixed(2)})`);
    const wings = w.zones.filter((z) => WING_LOCATIONS.includes(z.location));
    if (n > 6) {
      // Algún pasillo de ala es vertical: las alas ya no van en una sola fila.
      assert.ok(wings.some((z) => z.rect.h > z.rect.w), `N=${n}: sin tramo vertical`);
      // Más cuadrado que la línea recta equivalente (7 tiles más de ancho por ala).
      const straight = (six.cols + 7 * (Math.ceil(n / 2) - 3)) / six.rows;
      assert.ok(ratio <= 1.3 && ratio < straight, `N=${n}: relación ${ratio.toFixed(2)} vs recta ${straight.toFixed(2)}`);
    } else {
      assert.ok(wings.every((z) => z.rect.w > z.rect.h), `N=${n}: en línea recta`);
    }
  }
});
