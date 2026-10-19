// Módulos del mapa definidos por código (sin Tiled).
//
// Hay tres piezas:
//   - buildCore: el módulo fijo (entrada, recepción, sala de espera, cafetería,
//     sala de personal, base de camillas y pasillo principal).
//   - buildWing: un ala = un tramo de pasillo con una habitación a cada lado.
//   - buildTurn / buildCap: el codo que dobla el pasillo y la tapa del final.
//
// Las alas se describen en coordenadas locales (a, c) de un `Frame`:
//   a = distancia a lo largo del pasillo, c = desplazamiento lateral
//   (c > 0 es la derecha según el sentido de avance). Así la misma ala sirve
//   hacia el este, el norte o el oeste, que es lo que permite la L y la U.

import { TILE, isWalkableTile, isWallLike } from "./tiles.js";

// ---------------------------------------------------------------------------
// Plano: celdas dispersas con reglas que detectan solapamientos.

const KEY_OFFSET = 512;
const KEY_SPAN = 1024;

function cellKey(x, y) {
  return (y + KEY_OFFSET) * KEY_SPAN + (x + KEY_OFFSET);
}

/**
 * Plano en construcción. Guarda tiles en un mapa disperso (las coordenadas
 * pueden ser negativas mientras se arma) y las listas que luego forman el World.
 *
 * Las operaciones validan la geometría y lanzan un Error si dos piezas se pisan:
 *   - paint: pinta estructura. Un muro sobre muro/puerta/ventana no cambia nada;
 *     cualquier otra mezcla distinta es un solapamiento.
 *   - carve: abre una puerta o ventana en un muro existente.
 *   - place: pone un mueble sobre un piso caminable.
 */
export class Blueprint {
  constructor() {
    this.cells = new Map();
    this.zones = [];
    this.rooms = [];
    this.pois = [];
    this.decor = [];
    this.robotBase = [];
    this.spawn = null;
    this.staffRoom = null;
  }

  get(x, y) {
    return this.cells.get(cellKey(x, y)) ?? TILE.VOID;
  }

  /** Caja {minX, minY, maxX, maxY} (inclusive) de las celdas pintadas. */
  bounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const key of this.cells.keys()) {
      const x = (key % KEY_SPAN) - KEY_OFFSET;
      const y = Math.floor(key / KEY_SPAN) - KEY_OFFSET;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }

  paint(x, y, tile) {
    const cur = this.get(x, y);
    if (cur === TILE.VOID || cur === tile) {
      this.cells.set(cellKey(x, y), tile);
      return;
    }
    if (tile === TILE.WALL && isWallLike(cur)) return;
    throw new Error(`solapamiento en (${x},${y}): ${cur} -> ${tile}`);
  }

  carve(x, y, tile) {
    const cur = this.get(x, y);
    if (cur === tile) return;
    if (cur !== TILE.WALL) {
      throw new Error(`no hay muro para abrir en (${x},${y}): ${cur}`);
    }
    this.cells.set(cellKey(x, y), tile);
  }

  place(x, y, tile) {
    const cur = this.get(x, y);
    if (!isWalkableTile(cur)) {
      throw new Error(`no hay piso para el mueble en (${x},${y}): ${cur}`);
    }
    this.cells.set(cellKey(x, y), tile);
  }

  /** Rellena el rectángulo [x0..x1]×[y0..y1] (inclusive) con `tile`. */
  fill(x0, y0, x1, y1, tile) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.paint(x, y, tile);
    }
  }

  /** Cuarto: muro en el borde y `floor` adentro. Los muros compartidos se aceptan. */
  box(x0, y0, x1, y1, floor) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        this.paint(x, y, edge ? TILE.WALL : floor);
      }
    }
  }

  /**
   * Mueble sólido con su decoración. `extra` puede traer w, h, label, dir.
   * La decoración guarda en `under` el piso que el mueble tapa, para que el
   * arte lo dibuje debajo (palmera sobre grama, matera sobre baldosa...).
   */
  furniture(x, y, kind, extra = {}, tile = TILE.FURNITURE) {
    const w = extra.w ?? 1;
    const h = extra.h ?? 1;
    const under = this.get(x, y);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) this.place(x + dx, y + dy, tile);
    }
    this.addDecor(x, y, kind, { ...extra, under });
  }

  addDecor(x, y, kind, extra = {}) {
    this.decor.push({ tx: x, ty: y, kind, ...extra });
  }

  /** Decoración colgada en un muro; `facing` es hacia dónde mira (lado visible). */
  wallDecor(x, y, kind, facing, extra = {}) {
    if (!isWallLike(this.get(x, y))) {
      throw new Error(`decoración de muro sin muro en (${x},${y})`);
    }
    this.addDecor(x, y, kind, { facing, ...extra });
  }

  addPoi(x, y, kind) {
    this.pois.push({ tx: x, ty: y, kind });
  }
}

// ---------------------------------------------------------------------------
// Ancho real de la decoración de muro, en tiles a lo largo del muro, relativo
// al tile de anclaje: [izquierda, derecha]. Sale de frame.w y origin.x de
// web/assets/sprites.json (noSleepSign: 75 px con origin 29 cubre tx-2..tx+2).
// Lo que no está aquí ocupa solo su tile; si el decor trae `w`, cubre [0, w-1].

export const WALL_DECOR_SPAN = Object.freeze({
  noSleepSign: Object.freeze([-2, 2]),
  receptionSign: Object.freeze([-1, 1]),
  menuBoard: Object.freeze([-1, 1]),
});

/** [izq, der] de tiles que cubre una decoración de muro, relativo a su anclaje. */
export function wallDecorSpan(d) {
  if (WALL_DECOR_SPAN[d.kind]) return WALL_DECOR_SPAN[d.kind];
  return [0, (d.w ?? 1) - 1];
}

// ---------------------------------------------------------------------------
// Marcos locales para las alas.

const DIRS = {
  E: { f: [1, 0], r: [0, 1] },
  N: { f: [0, -1], r: [1, 0] },
  W: { f: [-1, 0], r: [0, -1] },
  S: { f: [0, 1], r: [-1, 0] },
};

/** Dirección que queda a la izquierda de `dir` (giro de 90° a la izquierda). */
export const LEFT_OF = Object.freeze({ E: "N", N: "W", W: "S", S: "E" });

function facingName(vx, vy) {
  if (vx > 0) return "right";
  if (vx < 0) return "left";
  if (vy > 0) return "down";
  return "up";
}

/**
 * Marco local con origen (ox, oy) sobre el eje del pasillo y sentido `dir`.
 * at(a, c) -> {x, y}; facing(da, dc) -> "up"|"down"|"left"|"right".
 */
export function makeFrame(ox, oy, dir) {
  const { f, r } = DIRS[dir];
  return {
    ox, oy, dir,
    at(a, c) {
      return { x: ox + a * f[0] + c * r[0], y: oy + a * f[1] + c * r[1] };
    },
    facing(da, dc) {
      return facingName(da * f[0] + dc * r[0], da * f[1] + dc * r[1]);
    },
  };
}

/** Rectángulo absoluto {tx, ty, w, h} que cubre [a0..a1]×[c0..c1] del marco. */
export function localRect(fr, a0, a1, c0, c1) {
  const p = fr.at(a0, c0);
  const q = fr.at(a1, c1);
  const tx = Math.min(p.x, q.x);
  const ty = Math.min(p.y, q.y);
  return { tx, ty, w: Math.abs(p.x - q.x) + 1, h: Math.abs(p.y - q.y) + 1 };
}

// Atajos para operar en coordenadas locales.
const L = {
  paint(bp, fr, a, c, t) { const p = fr.at(a, c); bp.paint(p.x, p.y, t); },
  carve(bp, fr, a, c, t) { const p = fr.at(a, c); bp.carve(p.x, p.y, t); },
  furniture(bp, fr, a, c, kind, extra) { const p = fr.at(a, c); bp.furniture(p.x, p.y, kind, extra); },
  decor(bp, fr, a, c, kind, extra) { const p = fr.at(a, c); bp.addDecor(p.x, p.y, kind, extra); },
  poi(bp, fr, a, c, kind) { const p = fr.at(a, c); bp.addPoi(p.x, p.y, kind); },
  // Decoración en el muro lateral c = ±2, mirando hacia el pasillo.
  wall(bp, fr, a, c, kind, extra) {
    const p = fr.at(a, c);
    bp.wallDecor(p.x, p.y, kind, fr.facing(0, -Math.sign(c)), extra);
  },
};

// ---------------------------------------------------------------------------
// Módulo fijo.

/** Largo (en tiles) de un ala a lo largo del pasillo; los muros de los cuartos se comparten. */
export const WING_LENGTH = 7;

/**
 * Dibuja el módulo fijo con su esquina superior izquierda en (0, 0).
 * Ocupa 30×31 tiles. Devuelve el marco donde arranca la cadena de alas:
 * el pasillo principal sigue hacia el este desde x = 29.
 */
export function buildCore(bp) {
  const T = TILE;

  // --- Sala de personal (Administrative Block): hamaca, nevera y tablero.
  bp.box(0, 0, 9, 9, T.WOOD);
  bp.carve(4, 9, T.DOOR);
  bp.furniture(2, 2, "hammock", { w: 2 });
  bp.furniture(8, 1, "fridge");
  bp.wallDecor(5, 0, "board", "down");
  bp.furniture(5, 5, "table", { w: 2 });
  for (const [x, y] of [[5, 4], [6, 4], [5, 6], [6, 6]]) bp.addDecor(x, y, "chair");
  bp.furniture(1, 7, "locker", { h: 2 });
  bp.addDecor(3, 6, "fan");
  bp.staffRoom = { rect: { tx: 1, ty: 1, w: 8, h: 8 } };
  bp.zones.push({ name: "Sala de personal", location: "Administrative Block", rect: bp.staffRoom.rect });

  // --- Base de las camillas robot (Maintenance Area): 3 puestos de carga.
  bp.box(9, 0, 17, 9, T.FLOOR);
  bp.carve(13, 9, T.DOOR);
  for (const x of [11, 13, 15]) {
    bp.wallDecor(x, 0, "charger", "down");
    bp.addDecor(x, 1, "chargePad");
    bp.robotBase.push({ tx: x, ty: 1 });
  }
  bp.furniture(16, 5, "toolShelf", { h: 2 });
  bp.furniture(10, 6, "workbench", { h: 2 });
  bp.zones.push({ name: "Base de camillas", location: "Maintenance Area", rect: { tx: 10, ty: 1, w: 7, h: 8 } });

  // --- Cafetería con el carrito del tinto.
  bp.box(17, 0, 29, 9, T.WOOD);
  bp.carve(22, 9, T.DOOR);
  bp.carve(23, 9, T.DOOR);
  bp.furniture(19, 1, "counter", { w: 5 }, T.COUNTER);
  bp.wallDecor(21, 0, "menuBoard", "down");
  bp.furniture(26, 2, "coffeeCart");
  bp.addPoi(26, 3, "coffee");
  for (const [x, y] of [[20, 4], [20, 7], [25, 6]]) bp.furniture(x, y, "table");
  // Comida sobre las mesas (después del decor de la mesa, mismo tile).
  for (const [x, y, kind] of [[20, 4, "salchipapas"], [20, 7, "cervezaAguila"], [25, 6, "arrozCoco"]]) {
    bp.addDecor(x, y, kind, { onTable: true });
  }
  for (const [x, y] of [[19, 4], [21, 4], [19, 7], [21, 7], [24, 6], [26, 6]]) {
    bp.addDecor(x, y, "chair");
    bp.addPoi(x, y, "chair");
  }
  bp.furniture(28, 8, "plant");
  bp.addDecor(23, 4, "fan");
  bp.zones.push({ name: "Cafetería", location: "Cafeteria", rect: { tx: 18, ty: 1, w: 11, h: 8 } });

  // --- Sala de espera: sillas, TV, picó y mural.
  bp.box(0, 13, 17, 22, T.FLOOR);
  for (const x of [7, 8, 9]) bp.carve(x, 13, T.DOOR);
  bp.wallDecor(4, 13, "tv", "down");
  bp.addPoi(4, 14, "tv");
  for (const y of [16, 19]) {
    for (const x of [3, 4, 5, 6, 10, 11, 12, 13]) bp.addDecor(x, y, "chair");
  }
  for (const [x, y] of [[3, 16], [5, 16], [10, 16], [12, 16], [4, 19], [6, 19], [11, 19], [13, 19]]) {
    bp.addPoi(x, y, "chair");
  }
  bp.furniture(15, 14, "pico");
  bp.addPoi(14, 14, "pico");
  bp.wallDecor(11, 22, "mural", "up", { w: 3 });
  bp.addPoi(12, 21, "mural");
  bp.furniture(1, 14, "plant");
  bp.furniture(16, 21, "plant");
  bp.addDecor(7, 17, "rug", { w: 3, h: 2 });
  bp.zones.push({ name: "Sala de espera", location: "Waiting Room", rect: { tx: 1, ty: 14, w: 16, h: 8 } });

  // --- Recepción con mostrador y puerta de vidrio hacia la entrada.
  bp.box(17, 13, 29, 22, T.FLOOR);
  for (const x of [22, 23, 24]) bp.carve(x, 13, T.DOOR);
  bp.furniture(20, 15, "counter", { h: 5 }, T.COUNTER);
  bp.addDecor(20, 17, "bell");
  bp.addDecor(19, 17, "deskChair");
  bp.addPoi(21, 17, "reception");
  bp.wallDecor(19, 13, "receptionSign", "down");
  bp.furniture(28, 14, "plant");
  bp.furniture(28, 21, "plant");
  for (const x of [23, 24, 25]) {
    bp.carve(x, 22, T.DOOR);
    bp.addDecor(x, 22, "glassDoor");
  }
  bp.addDecor(24, 21, "doormat");
  bp.zones.push({ name: "Recepción", location: "Reception", rect: { tx: 18, ty: 14, w: 11, h: 8 } });

  // --- Pasillo principal: conecta todo y sigue hacia las alas.
  bp.fill(1, 10, 28, 12, T.FLOOR);
  for (const y of [10, 11, 12]) bp.paint(0, y, T.WALL);
  bp.carve(0, 11, T.WINDOW);
  bp.furniture(1, 10, "plant");
  bp.furniture(1, 12, "plant");
  bp.addPoi(1, 11, "window");
  for (const x of [6, 16, 25]) bp.addDecor(x, 11, "fan");
  bp.wallDecor(11, 9, "extinguisher", "down");
  bp.wallDecor(19, 9, "noSleepSign", "down", { label: "SE PROHÍBE DORMIR EN EL PASILLO" });
  bp.wallDecor(16, 13, "water", "up");
  bp.addPoi(16, 12, "water");
  bp.addDecor(18, 12, "bench", { w: 2 });
  bp.addPoi(18, 12, "bench");
  bp.zones.push({ name: "Pasillo principal", location: "Main Hallway", rect: { tx: 1, ty: 10, w: 28, h: 3 } });

  // --- Entrada exterior con palmeras y letrero.
  bp.fill(1, 23, 28, 29, T.GRASS);
  for (let y = 23; y <= 29; y++) {
    for (const x of [23, 24, 25]) bp.cells.set(cellKey(x, y), T.PATH); // el camino reemplaza la grama
  }
  for (let y = 23; y <= 30; y++) { bp.paint(0, y, T.HEDGE); bp.paint(29, y, T.HEDGE); }
  for (let x = 1; x <= 28; x++) bp.paint(x, 30, T.HEDGE);
  for (const [x, y] of [[3, 24], [15, 24], [19, 28], [27, 24], [14, 28]]) bp.furniture(x, y, "palm");
  bp.addPoi(3, 25, "palm");
  bp.addPoi(15, 25, "palm");
  bp.furniture(20, 25, "sign", { w: 2, label: "HOSPITAL DE LOS COSTEÑOS" });
  bp.addDecor(11, 24, "bench", { w: 2 });
  bp.addPoi(11, 24, "bench");
  for (const [x, y] of [[2, 28], [3, 28], [16, 27], [26, 28]]) bp.addDecor(x, y, "flowers");
  // Cancha de fútbol 8×5 (pasto caminable) a la izquierda del camino de entrada.
  bp.addDecor(5, 25, "cancha", { w: 8, h: 5 });
  bp.addPoi(9, 27, "cancha");
  // Salida lateral al camino de arena que lleva a la playa (la cierra el generador).
  bp.addDecor(24, 30, "gate");
  bp.spawn = { tx: 24, ty: 29 };
  bp.zones.push({ name: "Entrada principal", location: "Main Entrance", rect: { tx: 1, ty: 23, w: 28, h: 7 } });

  return makeFrame(29, 11, "E");
}

// ---------------------------------------------------------------------------
// Ala: pasillo de 3 de ancho con una habitación (o el baño/bodega) a cada lado.

/**
 * Habitación de paciente en el lado `s` (-1 izquierda, +1 derecha) del tramo
 * que empieza en `a0`. Interior de 6×5: cama de 2 tiles contra el muro
 * exterior, monitor, mesita, matera y ventana; puerta numerada al pasillo.
 */
function buildPatientRoom(bp, fr, a0, s, number) {
  const T = TILE;
  for (let a = a0; a <= a0 + 7; a++) {
    for (let k = 2; k <= 8; k++) {
      const edge = a === a0 || a === a0 + 7 || k === 2 || k === 8;
      L.paint(bp, fr, a, s * k, edge ? T.WALL : T.ROOM_FLOOR);
    }
  }
  L.carve(bp, fr, a0 + 3, s * 2, T.DOOR);
  L.wall(bp, fr, a0 + 2, s * 2, "doorNumber", { label: String(number) });
  L.carve(bp, fr, a0 + 3, s * 8, T.WINDOW);
  L.carve(bp, fr, a0 + 4, s * 8, T.WINDOW);

  // Cama: cabecera contra el muro exterior y pies hacia el pasillo.
  const head = fr.at(a0 + 4, s * 7);
  const foot = fr.at(a0 + 4, s * 6);
  bp.place(head.x, head.y, T.BED);
  bp.place(foot.x, foot.y, T.BED);
  bp.addDecor(head.x, head.y, "bed", { dir: fr.facing(0, -s), under: T.ROOM_FLOOR });
  L.furniture(bp, fr, a0 + 5, s * 7, "monitor");
  L.furniture(bp, fr, a0 + 2, s * 7, "nightstand");
  L.furniture(bp, fr, a0 + 1, s * 7, "plant");

  const door = fr.at(a0 + 3, s * 2);
  const bedside = fr.at(a0 + 3, s * 7);
  bp.rooms.push({
    number,
    rect: localRect(fr, a0 + 1, a0 + 6, s * 3, s * 7),
    door: { tx: door.x, ty: door.y },
    bed: { tx: head.x, ty: head.y },
    bedside: { tx: bedside.x, ty: bedside.y },
  });
}

/** Baño y bodega (Sterilization Unit) que completa la última ala con N impar. */
function buildStorage(bp, fr, a0, s) {
  const T = TILE;
  for (let a = a0; a <= a0 + 7; a++) {
    for (let k = 2; k <= 8; k++) {
      const edge = a === a0 || a === a0 + 7 || k === 2 || k === 8;
      L.paint(bp, fr, a, s * k, edge ? T.WALL : T.FLOOR);
    }
  }
  L.carve(bp, fr, a0 + 3, s * 2, T.DOOR);
  L.wall(bp, fr, a0 + 2, s * 2, "restroomSign");
  L.carve(bp, fr, a0 + 3, s * 8, T.WINDOW);
  L.furniture(bp, fr, a0 + 1, s * 7, "toilet");
  L.furniture(bp, fr, a0 + 2, s * 7, "sink");
  L.furniture(bp, fr, a0 + 5, s * 7, "shelf");
  L.furniture(bp, fr, a0 + 6, s * 7, "shelf");
  L.furniture(bp, fr, a0 + 6, s * 4, "linenCart");
  L.poi(bp, fr, a0 + 1, s * 6, "restroom");
  bp.zones.push({
    name: "Baño y bodega",
    location: "Sterilization Unit",
    rect: localRect(fr, a0 + 1, a0 + 6, s * 3, s * 7),
  });
}

/**
 * Un ala del hospital a partir de `a0` en el marco `fr`.
 * spec = { index, location, name, left, right, extendBefore, extendAfter }
 *   left/right: { number } para una habitación o { storage: true } para el baño.
 *   extendBefore/After: tiles de codo que la zona del pasillo absorbe.
 */
export function buildWing(bp, fr, a0, spec) {
  const T = TILE;
  for (let a = a0; a < a0 + WING_LENGTH; a++) {
    for (let c = -1; c <= 1; c++) L.paint(bp, fr, a, c, T.FLOOR);
  }
  for (let a = a0; a <= a0 + WING_LENGTH; a++) {
    L.paint(bp, fr, a, -2, T.WALL);
    L.paint(bp, fr, a, 2, T.WALL);
  }

  for (const [s, side] of [[-1, spec.left], [1, spec.right]]) {
    if (side.storage) buildStorage(bp, fr, a0, s);
    else buildPatientRoom(bp, fr, a0, s, side.number);
  }

  // Decoración del pasillo. El letrero mide 5 tiles (ver WALL_DECOR_SPAN): cabe
  // entre la placa de una puerta y la del ala siguiente (a0+4..a0+8), así que
  // va en a0+6 de un lado; agua y extintor van en el lado contrario. Solo en
  // muros horizontales (el sprite es horizontal) y no en la última ala, que
  // no tiene a0+8. El ala anterior ocupa a0+1 del lado del letrero opuesto.
  L.decor(bp, fr, a0 + 3, 0, "fan");
  const signSide = spec.index % 2 === 0 ? -2 : 2;
  if ((fr.dir === "E" || fr.dir === "W") && !spec.last) {
    L.wall(bp, fr, a0 + 6, signSide, "noSleepSign", { label: "SE PROHÍBE DORMIR EN EL PASILLO" });
  }
  const other = -signSide;
  L.wall(bp, fr, a0 + 6, other, "extinguisher");
  L.wall(bp, fr, a0 + 4, other, "water");
  L.poi(bp, fr, a0 + 4, other / 2, "water");
  if (a0 > 0) L.furniture(bp, fr, a0, spec.index % 2 === 0 ? 1 : -1, "plant");

  bp.zones.push({
    name: spec.name,
    location: spec.location,
    rect: localRect(fr, a0 - (spec.extendBefore ?? 0), a0 + WING_LENGTH - 1 + (spec.extendAfter ?? 0), -1, 1),
  });
}

/** Tiles que la zona del ala anterior absorbe del codo (tramo recto). */
export const TURN_STRAIGHT = 7;
/** Tiles del cuadro de giro que absorbe la zona del ala siguiente. */
export const TURN_CORNER = 3;

/**
 * Codo que dobla el pasillo a la izquierda en `aEnd`. Un tramo recto de 7
 * (con ventanas al exterior) deja espacio para que los cuartos del ala nueva
 * no choquen con los del ala anterior; luego un cuadro de 3×3 gira.
 * Devuelve el marco de la siguiente corrida.
 */
export function buildTurn(bp, fr, aEnd) {
  const T = TILE;
  const ac = aEnd + TURN_STRAIGHT + 1; // centro del cuadro de giro
  for (let a = aEnd; a <= ac + 1; a++) {
    for (let c = -1; c <= 1; c++) L.paint(bp, fr, a, c, T.FLOOR);
  }
  for (let a = aEnd; a <= ac + 2; a++) L.paint(bp, fr, a, 2, T.WALL);
  for (let a = aEnd; a < aEnd + TURN_STRAIGHT; a++) L.paint(bp, fr, a, -2, T.WALL);
  for (let c = -2; c <= 2; c++) L.paint(bp, fr, ac + 2, c, T.WALL);

  for (const a of [aEnd + 1, aEnd + 3, aEnd + 5]) {
    L.carve(bp, fr, a, 2, T.WINDOW);
    L.poi(bp, fr, a, 1, "window");
  }
  L.carve(bp, fr, ac + 2, 0, T.WINDOW);
  L.poi(bp, fr, ac + 1, 0, "window");
  L.decor(bp, fr, aEnd + 3, 0, "fan");
  L.decor(bp, fr, aEnd + 2, -1, "bench");
  L.poi(bp, fr, aEnd + 2, -1, "bench");
  if (fr.dir === "E" || fr.dir === "W") {
    L.wall(bp, fr, aEnd + 4, -2, "noSleepSign", { label: "SE PROHÍBE DORMIR EN EL PASILLO" });
  }
  L.furniture(bp, fr, aEnd + 6, -1, "plant");

  const o = fr.at(ac, -2);
  return makeFrame(o.x, o.y, LEFT_OF[fr.dir]);
}

/** Tapa del final del último pasillo, con una ventana al fondo. */
export function buildCap(bp, fr, aEnd) {
  for (let c = -2; c <= 2; c++) L.paint(bp, fr, aEnd, c, TILE.WALL);
  L.carve(bp, fr, aEnd, 0, TILE.WINDOW);
  L.poi(bp, fr, aEnd - 1, 0, "window");
  L.furniture(bp, fr, aEnd - 1, 1, "plant");
}
