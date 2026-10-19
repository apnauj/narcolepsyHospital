// Generador determinista del mapa del hospital.
//
// Arma el módulo fijo y encadena ceil(N/2) alas hacia el este. Con más de
// tres alas (N > 6) el pasillo dobla para no quedar como un tubo largo:
//   - 4 alas: 1 al este y 3 al norte (una L).
//   - 5 alas: 1 al este, 2 al norte y 2 de regreso al oeste por encima del
//     módulo fijo (una U acostada que abraza la cafetería).
// Al final se recorta el plano a su caja más un margen de jardín.

import { TILE, isWalkableTile } from "./tiles.js";
import {
  Blueprint, buildCore, buildWing, buildTurn, buildCap,
  WING_LENGTH, TURN_STRAIGHT, TURN_CORNER,
} from "./modules.js";

/** Nombres EXACTOS de hospital.Location para los pasillos de las alas, en orden. */
export const WING_LOCATIONS = Object.freeze([
  "East Hallway", "West Hallway", "North Hallway", "South Hallway", "Pediatrics Hallway",
]);

const WING_NAMES = {
  "East Hallway": "Pasillo Este",
  "West Hallway": "Pasillo Oeste",
  "North Hallway": "Pasillo Norte",
  "South Hallway": "Pasillo Sur",
  "Pediatrics Hallway": "Pasillo de Pediatría",
};

/** Tiles de jardín alrededor del edificio (al norte lo reemplaza la playa). */
const MARGIN = 2;
/** Franja de playa del borde norte: mar arriba y arena pegada al edificio. */
export const SEA_ROWS = 4;
export const SAND_ROWS = 3;
const BEACH_ROWS = SEA_ROWS + SAND_ROWS;
/** Fila (del módulo fijo) donde el seto de la entrada abre la salida lateral. */
const GATE_Y = 27;

export const MIN_ROOMS = 2;
export const MAX_ROOMS = 10;

/**
 * Sentido de cada ala según cuántas hay. Exportada para los tests y el preview.
 * @param {number} wings 1..5
 * @returns {string[]} "E" | "N" | "W" por ala
 */
export function wingDirections(wings) {
  if (wings <= 3) return Array(wings).fill("E");
  if (wings === 4) return ["E", "N", "N", "N"];
  return ["E", "N", "N", "W", "W"];
}

/**
 * Genera el mundo para `rooms` habitaciones (2..10). Siempre devuelve lo mismo
 * para el mismo número.
 * @returns {World} ver docs/gui/CONTRACT.md, sección 5. Los `rect` son
 *   {tx, ty, w, h} en tiles; el de una habitación o zona es su interior.
 */
export function generateWorld({ rooms } = {}) {
  if (!Number.isInteger(rooms) || rooms < MIN_ROOMS || rooms > MAX_ROOMS) {
    throw new RangeError(`rooms debe ser un entero entre ${MIN_ROOMS} y ${MAX_ROOMS}`);
  }
  const bp = new Blueprint();
  let frame = buildCore(bp);

  const wings = Math.ceil(rooms / 2);
  const dirs = wingDirections(wings);
  let a = 0; // posición a lo largo de la corrida actual
  for (let i = 0; i < wings; i++) {
    const turnsBefore = i > 0 && dirs[i] !== dirs[i - 1];
    const turnsAfter = i < wings - 1 && dirs[i + 1] !== dirs[i];
    if (turnsBefore) {
      frame = buildTurn(bp, frame, a);
      a = 0;
    }
    const left = 101 + 2 * i;
    const right = left + 1;
    buildWing(bp, frame, a, {
      index: i,
      location: WING_LOCATIONS[i],
      name: WING_NAMES[WING_LOCATIONS[i]],
      left: { number: left },
      right: right <= 100 + rooms ? { number: right } : { storage: true },
      extendBefore: turnsBefore ? TURN_CORNER : 0,
      extendAfter: turnsAfter ? TURN_STRAIGHT : 0,
      last: i === wings - 1,
    });
    a += WING_LENGTH;
  }
  buildCap(bp, frame, a);

  return finalize(bp);
}

// Recorta el plano, traslada todas las coordenadas y arma el objeto World.
function finalize(bp) {
  const { minX, minY, maxX, maxY } = bp.bounds();
  const dx = MARGIN - minX;
  const dy = BEACH_ROWS - minY;
  const cols = maxX - minX + 1 + 2 * MARGIN;
  const rows = maxY - minY + 1 + BEACH_ROWS + MARGIN;

  const tiles = new Uint8Array(cols * rows);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) tiles[(y + dy) * cols + (x + dx)] = bp.get(x, y);
  }

  const beach = paintBeach(tiles, cols, rows, dx, dy);

  // Una ventana solo tiene sentido en un muro que da al jardín.
  const get = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? TILE.VOID : tiles[y * cols + x]);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (tiles[y * cols + x] !== TILE.WINDOW) continue;
      const exterior = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => [TILE.VOID, TILE.SAND].includes(get(x + ox, y + oy)));
      if (!exterior) tiles[y * cols + x] = TILE.WALL;
    }
  }

  const pt = (p) => ({ ...p, tx: p.tx + dx, ty: p.ty + dy });
  const rect = (r) => ({ tx: r.tx + dx, ty: r.ty + dy, w: r.w, h: r.h });
  const nextToWindow = (p) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => get(p.tx + ox, p.ty + oy) === TILE.WINDOW);

  const walkable = (tx, ty) =>
    tx >= 0 && ty >= 0 && tx < cols && ty < rows && isWalkableTile(tiles[ty * cols + tx]);

  return {
    cols,
    rows,
    tiles,
    walkable,
    zones: bp.zones.map((z) => ({ name: z.name, location: z.location, rect: rect(z.rect) })),
    rooms: bp.rooms
      .map((r) => ({ number: r.number, rect: rect(r.rect), door: pt(r.door), bed: pt(r.bed), bedside: pt(r.bedside) }))
      .sort((p, q) => p.number - q.number),
    pois: [...bp.pois.map(pt).filter((p) => p.kind !== "window" || nextToWindow(p)), ...beach.pois],
    spawn: pt(bp.spawn),
    robotBase: bp.robotBase.map(pt),
    staffRoom: { rect: rect(bp.staffRoom.rect) },
    decor: [...bp.decor.map(pt), ...beach.decor],
    beach: beach.area,
  };
}

/** true si el tile (tx, ty) cae dentro del rectángulo {tx, ty, w, h}. */
export function rectContains(r, tx, ty) {
  return tx >= r.tx && ty >= r.ty && tx < r.tx + r.w && ty < r.ty + r.h;
}

/**
 * Zona que contiene el tile, o null (muros, puertas, habitaciones, jardín).
 * Las zonas no se solapan, así que hay a lo sumo una.
 */
export function zoneAt(world, tx, ty) {
  for (const z of world.zones) {
    if (rectContains(z.rect, tx, ty)) return z;
  }
  return null;
}

/** Habitación cuyo interior contiene el tile, o null. */
export function roomAt(world, tx, ty) {
  for (const r of world.rooms) {
    if (rectContains(r.rect, tx, ty)) return r;
  }
  return null;
}

/**
 * Pinta la playa del borde norte y el camino de arena que sale del seto de la
 * entrada, sube por el margen oeste y llega a la arena. Todo en coordenadas
 * finales. Devuelve decoración, pois y las cajas de arena y mar.
 */
function paintBeach(tiles, cols, rows, dx, dy) {
  const set = (x, y, t) => { tiles[y * cols + x] = t; };
  for (let y = 0; y < BEACH_ROWS; y++) {
    for (let x = 0; x < cols; x++) set(x, y, y < SEA_ROWS ? TILE.SEA : TILE.SAND);
  }
  // Camino de arena: del hueco del seto (x = 0 del módulo fijo) al margen y arriba.
  const lane = MARGIN - 1;
  const gateX = dx;
  const gateY = GATE_Y + dy;
  for (let x = lane; x <= gateX; x++) set(x, gateY, TILE.SAND);
  for (let y = BEACH_ROWS; y <= gateY; y++) set(lane, y, TILE.SAND);

  const decor = [];
  const pois = [];
  const top = SEA_ROWS;           // fila de arena junto al mar
  const mid = SEA_ROWS + 1;
  // Palmeras en la fila de arriba (sólidas), cada 9 tiles, lejos del camino.
  for (let x = 4; x < cols - 1; x += 9) {
    set(x, top, TILE.FURNITURE);
    decor.push({ tx: x, ty: top, kind: "palm", under: TILE.SAND });
  }
  // Sombrillas (caminables) y conchas sueltas.
  for (let x = 7; x < cols - 2; x += 12) decor.push({ tx: x, ty: mid, kind: "umbrella" });
  for (let x = 5; x < cols - 2; x += 7) decor.push({ tx: x + (x % 3), ty: BEACH_ROWS - 1 - (x % 2), kind: "shell" });
  // Puntos de paseo: bajo cada sombrilla y uno por tramo.
  for (let x = 6; x < cols - 2; x += 12) pois.push({ tx: x, ty: mid, kind: "beach" });
  pois.push({ tx: 3, ty: mid, kind: "beach" });
  return {
    decor,
    pois,
    area: {
      sea: { tx: 0, ty: 0, w: cols, h: SEA_ROWS },
      sand: { tx: 0, ty: SEA_ROWS, w: cols, h: SAND_ROWS },
    },
  };
}
