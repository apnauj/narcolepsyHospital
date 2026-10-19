// Dibujo del mapa en el canvas.
//
// drawWorld recorre solo los tiles visibles y delega el aspecto en un
// `painter(ctx, tile, x, y, tx, ty)` que dibuja un tile de 16×16 en (x, y),
// en píxeles de mundo (el contexto ya viene escalado y trasladado).
// Un painter puede traer además dos ganchos opcionales:
//   painter.decor(ctx, decor, x, y)          // un elemento de world.decor
//     (los muebles traen `under`: el tipo de piso que tapan)
//   painter.zoneBorder(ctx, zone, x, y, w, h) // el borde de una zona
// flatPainter es la versión con colores planos; feature/gui-art la cambia
// por tilePainter(art) con la misma firma.

import { TILE, TILE_SIZE } from "./tiles.js";

/** Paleta Caribe de los colores planos. */
export const FLAT_COLORS = Object.freeze({
  garden: "#3e8948",
  gardenDark: "#2f6e3a",
  grass: "#63c74d",
  grassDark: "#4fa83c",
  hedge: "#265c42",
  hedgeLight: "#3e8948",
  path: "#e8c99b",
  pathDark: "#d4b07c",
  floorA: "#fdf6e3",       // blanco cálido
  floorB: "#d8f3ea",       // verde menta clínico claro
  roomFloor: "#f6ead0",
  roomLine: "#eadbb9",
  wood: "#e4b77f",          // madera clara
  woodLine: "#c9935a",
  wall: "#efe0c0",
  wallTop: "#fff6e0",
  wallShadow: "#b89c70",
  outline: "#2b2118",
  door: "#f7c948",          // amarillo sol
  doorFrame: "#c8961e",
  glass: "#2f80c2",         // azul mar
  glassLight: "#8fd0ff",
  red: "#d62839",           // rojo y blanco
  white: "#ffffff",
  furniture: "#c98a4b",
  furnitureDark: "#7a4f2a",
  counter: "#d9a066",
  counterFront: "#8a5a32",
  mint: "#8fd8c4",
  sun: "#f7c948",
  leaf: "#3fa34d",
  trunk: "#8a5a32",
  terracotta: "#c4643a",
  steel: "#9aa5ad",
  dark: "#22303c",
  sand: "#f2dca0",
  sandDark: "#dcc07a",
  sea: "#2f80c2",
  seaLight: "#5db4e8",
  seaFoam: "#d8f3ff",
  pitch: "#4fa83c",
  pitchLine: "#ffffff",
  beer: "#f7c948",
  potato: "#e8b04a",
});

const C = FLAT_COLORS;
const S = TILE_SIZE;

// Ruido determinista por tile, para variar la grama sin aleatoriedad.
function hash(tx, ty) {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function rect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawWall(ctx, x, y) {
  rect(ctx, C.wall, x, y, S, S);
  rect(ctx, C.wallTop, x, y, S, 3);
  rect(ctx, C.wallShadow, x, y + S - 3, S, 3);
}

/**
 * Painter de colores planos: distingue jardín, grama, camino, seto, pisos,
 * muro, ventana, puerta, cama, muebles y mostrador.
 */
export function flatPainter(ctx, tile, x, y, tx, ty) {
  switch (tile) {
    case TILE.VOID: {
      rect(ctx, C.garden, x, y, S, S);
      const h = hash(tx, ty);
      if (h % 5 === 0) rect(ctx, C.gardenDark, x + (h % 11), y + ((h >> 4) % 11), 3, 2);
      break;
    }
    case TILE.GRASS: {
      rect(ctx, C.grass, x, y, S, S);
      const h = hash(tx, ty);
      if (h % 3 === 0) rect(ctx, C.grassDark, x + (h % 12), y + ((h >> 4) % 12), 1, 3);
      break;
    }
    case TILE.PATH:
      rect(ctx, C.path, x, y, S, S);
      rect(ctx, C.pathDark, x + (hash(tx, ty) % 12), y + 6, 2, 2);
      break;
    case TILE.HEDGE:
      rect(ctx, C.hedge, x, y, S, S);
      rect(ctx, C.hedgeLight, x + 2, y + 2, S - 4, 5);
      break;
    case TILE.FLOOR:
      rect(ctx, (tx + ty) % 2 === 0 ? C.floorA : C.floorB, x, y, S, S);
      break;
    case TILE.ROOM_FLOOR:
      rect(ctx, C.roomFloor, x, y, S, S);
      rect(ctx, C.roomLine, x, y + S - 1, S, 1);
      rect(ctx, C.roomLine, x + S - 1, y, 1, S);
      break;
    case TILE.WOOD:
      rect(ctx, C.wood, x, y, S, S);
      rect(ctx, C.woodLine, x, y + 5, S, 1);
      rect(ctx, C.woodLine, x, y + 11, S, 1);
      rect(ctx, C.woodLine, x + ((tx % 2) ? 4 : 11), y, 1, 5);
      break;
    case TILE.WALL:
      drawWall(ctx, x, y);
      break;
    case TILE.WINDOW:
      drawWall(ctx, x, y);
      rect(ctx, C.white, x + 2, y + 2, S - 4, S - 5);
      rect(ctx, C.glass, x + 3, y + 3, S - 6, S - 7);
      rect(ctx, C.glassLight, x + 4, y + 4, 3, 2);
      break;
    case TILE.DOOR:
      rect(ctx, C.doorFrame, x, y, S, S);
      rect(ctx, C.door, x + 2, y + 1, S - 4, S - 2);
      rect(ctx, C.doorFrame, x + S - 5, y + 7, 2, 2);
      break;
    case TILE.BED:
      rect(ctx, C.roomFloor, x, y, S, S);
      rect(ctx, C.outline, x + 1, y + 1, S - 2, S - 2);
      rect(ctx, C.white, x + 2, y + 2, S - 4, S - 4);
      rect(ctx, C.red, x + 2, y + 8, S - 4, 6);
      rect(ctx, C.white, x + 2, y + 10, S - 4, 1);
      break;
    case TILE.FURNITURE:
      rect(ctx, C.furnitureDark, x + 1, y + 1, S - 2, S - 2);
      rect(ctx, C.furniture, x + 2, y + 2, S - 4, S - 5);
      break;
    case TILE.SAND: {
      rect(ctx, C.sand, x, y, S, S);
      const h = hash(tx, ty);
      if (h % 4 === 0) rect(ctx, C.sandDark, x + (h % 12), y + ((h >> 4) % 12), 2, 1);
      break;
    }
    case TILE.SEA: {
      rect(ctx, C.sea, x, y, S, S);
      const h = hash(tx, ty);
      rect(ctx, C.seaLight, x + (h % 8), y + 4 + ((h >> 3) % 6), 5, 1);
      if (ty >= 0 && h % 3 === 0) rect(ctx, C.seaFoam, x + ((h >> 5) % 9), y + 12, 4, 1);
      break;
    }
    case TILE.COUNTER:
      rect(ctx, C.counterFront, x, y, S, S);
      rect(ctx, C.counter, x, y, S, S - 5);
      break;
    default:
      rect(ctx, "#ff00ff", x, y, S, S); // tipo desconocido: que se note
  }
}

// --- Decoración en colores planos: siluetas simples por tipo.

// Dígitos de 3×5 para el número de las puertas (legible a escala 1).
const DIGITS = [
  "111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001",
  "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111",
];

function drawNumber(ctx, text, x, y, color) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of text) {
    const bits = DIGITS[ch.charCodeAt(0) - 48];
    if (bits) {
      for (let i = 0; i < 15; i++) if (bits[i] === "1") ctx.fillRect(cx + (i % 3), y + Math.floor(i / 3), 1, 1);
    }
    cx += 4;
  }
}

const DECOR = {
  palm(ctx, x, y) {
    rect(ctx, C.trunk, x + 7, y + 6, 3, 10);
    rect(ctx, C.leaf, x + 1, y + 2, 14, 4);
    rect(ctx, C.leaf, x + 5, y, 6, 8);
    rect(ctx, C.hedge, x + 3, y + 5, 3, 2);
    rect(ctx, C.hedge, x + 11, y + 5, 3, 2);
  },
  plant(ctx, x, y) {
    rect(ctx, C.terracotta, x + 4, y + 9, 8, 6);
    rect(ctx, C.leaf, x + 3, y + 2, 10, 7);
    rect(ctx, C.hedge, x + 7, y + 1, 2, 8);
  },
  flowers(ctx, x, y) {
    rect(ctx, C.red, x + 3, y + 4, 2, 2);
    rect(ctx, C.sun, x + 9, y + 7, 2, 2);
    rect(ctx, C.white, x + 5, y + 11, 2, 2);
  },
  fan(ctx, x, y) {
    ctx.globalAlpha = 0.55;
    rect(ctx, C.dark, x + 2, y + 7, 12, 2);
    rect(ctx, C.dark, x + 7, y + 2, 2, 12);
    ctx.globalAlpha = 1;
    rect(ctx, C.steel, x + 6, y + 6, 4, 4);
  },
  chair(ctx, x, y) {
    rect(ctx, C.red, x + 4, y + 3, 8, 3);
    rect(ctx, C.glass, x + 4, y + 6, 8, 6);
    rect(ctx, C.dark, x + 4, y + 12, 1, 2);
    rect(ctx, C.dark, x + 11, y + 12, 1, 2);
  },
  bench(ctx, x, y, d) {
    rect(ctx, C.woodLine, x + 1, y + 6, (d.w ?? 1) * S - 2, 5);
    rect(ctx, C.wood, x + 1, y + 6, (d.w ?? 1) * S - 2, 2);
  },
  table(ctx, x, y, d) {
    rect(ctx, C.white, x + 1, y + 2, (d.w ?? 1) * S - 2, S - 6);
    rect(ctx, C.red, x + 1, y + 2, (d.w ?? 1) * S - 2, 2);
  },
  rug(ctx, x, y, d) {
    ctx.globalAlpha = 0.6;
    rect(ctx, C.red, x + 2, y + 2, (d.w ?? 1) * S - 4, (d.h ?? 1) * S - 4);
    rect(ctx, C.sun, x + 5, y + 5, (d.w ?? 1) * S - 10, (d.h ?? 1) * S - 10);
    ctx.globalAlpha = 1;
  },
  doormat(ctx, x, y) {
    rect(ctx, C.counterFront, x + 2, y + 5, 12, 7);
  },
  tv(ctx, x, y) {
    rect(ctx, C.dark, x + 1, y + 2, 14, 10);
    rect(ctx, C.glass, x + 2, y + 3, 12, 8);
    rect(ctx, C.glassLight, x + 3, y + 4, 4, 2);
  },
  pico(ctx, x, y) {
    rect(ctx, C.dark, x + 1, y, 14, 16);
    rect(ctx, C.red, x + 3, y + 2, 10, 4);
    rect(ctx, C.sun, x + 5, y + 8, 6, 6);
    rect(ctx, C.leaf, x + 7, y + 10, 2, 2);
  },
  mural(ctx, x, y, d) {
    const w = (d.w ?? 1) * S;
    rect(ctx, C.sun, x + 1, y + 2, w - 2, 4);
    rect(ctx, C.glass, x + 1, y + 6, w - 2, 4);
    rect(ctx, C.red, x + 1, y + 10, w - 2, 3);
  },
  coffeeCart(ctx, x, y) {
    rect(ctx, C.red, x + 1, y + 1, 14, 4);
    rect(ctx, C.white, x + 4, y + 1, 3, 4);
    rect(ctx, C.trunk, x + 2, y + 6, 12, 8);
    rect(ctx, C.steel, x + 6, y + 7, 4, 4);
  },
  counter(ctx, x, y, d) {
    rect(ctx, C.white, x + 1, y + 1, (d.w ?? 1) * S - 2, 2);
  },
  bell(ctx, x, y) {
    rect(ctx, C.sun, x + 6, y + 5, 4, 3);
  },
  deskChair(ctx, x, y) {
    rect(ctx, C.dark, x + 4, y + 4, 8, 8);
  },
  fridge(ctx, x, y) {
    rect(ctx, C.white, x + 2, y, 12, 15);
    rect(ctx, C.steel, x + 2, y + 6, 12, 1);
    rect(ctx, C.steel, x + 11, y + 2, 1, 3);
  },
  hammock(ctx, x, y, d) {
    const w = (d.w ?? 1) * S;
    for (let i = 0; i < 4; i++) rect(ctx, [C.red, C.sun, C.leaf, C.glass][i], x + 2, y + 4 + i * 2, w - 4, 2);
  },
  locker(ctx, x, y, d) {
    rect(ctx, C.steel, x + 2, y + 1, 12, (d.h ?? 1) * S - 2);
    rect(ctx, C.dark, x + 7, y + 1, 1, (d.h ?? 1) * S - 2);
  },
  toolShelf(ctx, x, y, d) {
    rect(ctx, C.steel, x + 2, y + 1, 12, (d.h ?? 1) * S - 2);
    rect(ctx, C.red, x + 4, y + 4, 3, 3);
    rect(ctx, C.sun, x + 8, y + 14, 4, 3);
  },
  workbench(ctx, x, y, d) {
    rect(ctx, C.trunk, x + 1, y + 1, 14, (d.h ?? 1) * S - 2);
    rect(ctx, C.steel, x + 4, y + 6, 6, 3);
  },
  chargePad(ctx, x, y) {
    ctx.strokeStyle = C.sun;
    ctx.strokeRect(x + 1.5, y + 1.5, S - 3, S - 3);
  },
  monitor(ctx, x, y) {
    rect(ctx, C.dark, x + 3, y + 3, 10, 8);
    rect(ctx, C.leaf, x + 4, y + 7, 8, 1);
    rect(ctx, C.steel, x + 7, y + 11, 2, 4);
  },
  nightstand(ctx, x, y) {
    rect(ctx, C.wood, x + 3, y + 4, 10, 9);
    rect(ctx, C.white, x + 6, y + 5, 3, 3);
  },
  toilet(ctx, x, y) {
    rect(ctx, C.white, x + 4, y + 2, 8, 12);
    rect(ctx, C.floorB, x + 5, y + 7, 6, 5);
  },
  sink(ctx, x, y) {
    rect(ctx, C.white, x + 3, y + 4, 10, 7);
    rect(ctx, C.glassLight, x + 5, y + 6, 6, 3);
  },
  shelf(ctx, x, y) {
    rect(ctx, C.trunk, x + 1, y + 2, 14, 12);
    rect(ctx, C.white, x + 3, y + 4, 4, 3);
    rect(ctx, C.mint, x + 9, y + 9, 4, 3);
  },
  linenCart(ctx, x, y) {
    rect(ctx, C.steel, x + 2, y + 4, 12, 9);
    rect(ctx, C.white, x + 3, y + 3, 10, 4);
  },
  sign(ctx, x, y, d) {
    const w = (d.w ?? 1) * S;
    rect(ctx, C.trunk, x + 4, y + 9, 2, 7);
    rect(ctx, C.trunk, x + w - 6, y + 9, 2, 7);
    rect(ctx, C.white, x + 1, y + 1, w - 2, 9);
    rect(ctx, C.red, x + 1, y + 1, w - 2, 2);
    rect(ctx, C.glass, x + 4, y + 5, w - 8, 2);
  },
  gate(ctx, x, y) {
    rect(ctx, C.path, x + 2, y, 12, S);
  },
  glassDoor(ctx, x, y) {
    ctx.globalAlpha = 0.6;
    rect(ctx, C.glassLight, x + 2, y + 1, S - 4, S - 2);
    ctx.globalAlpha = 1;
  },
  // Decoración de muro.
  board(ctx, x, y) {
    rect(ctx, C.trunk, x + 1, y + 3, 14, 10);
    rect(ctx, C.leaf, x + 2, y + 4, 12, 8);
    rect(ctx, C.white, x + 4, y + 6, 6, 1);
  },
  menuBoard(ctx, x, y) {
    rect(ctx, C.dark, x + 2, y + 3, 12, 9);
    rect(ctx, C.sun, x + 4, y + 5, 7, 1);
    rect(ctx, C.white, x + 4, y + 8, 5, 1);
  },
  charger(ctx, x, y) {
    rect(ctx, C.dark, x + 4, y + 3, 8, 10);
    rect(ctx, C.sun, x + 7, y + 4, 2, 8);
  },
  extinguisher(ctx, x, y) {
    rect(ctx, C.red, x + 6, y + 4, 4, 9);
    rect(ctx, C.dark, x + 7, y + 2, 2, 2);
  },
  water(ctx, x, y) {
    rect(ctx, C.white, x + 4, y + 7, 8, 8);
    rect(ctx, C.glassLight, x + 5, y + 1, 6, 6);
  },
  noSleepSign(ctx, x, y) {
    rect(ctx, C.white, x + 2, y + 3, 12, 9);
    rect(ctx, C.red, x + 2, y + 3, 12, 2);
    rect(ctx, C.red, x + 6, y + 6, 4, 4);
    rect(ctx, C.white, x + 7, y + 7, 2, 2);
  },
  receptionSign(ctx, x, y) {
    rect(ctx, C.glass, x + 2, y + 4, 12, 7);
    rect(ctx, C.white, x + 4, y + 7, 8, 1);
  },
  restroomSign(ctx, x, y) {
    rect(ctx, C.glass, x + 4, y + 4, 8, 8);
    rect(ctx, C.white, x + 7, y + 5, 2, 6);
  },
  doorNumber(ctx, x, y, d) {
    rect(ctx, C.white, x + 1, y + 4, 14, 8);
    drawNumber(ctx, d.label ?? "", x + 2, y + 6, C.outline);
  },
  // Playa, cancha y comida.
  umbrella(ctx, x, y) {
    rect(ctx, C.trunk, x + 7, y + 6, 2, 9);
    rect(ctx, C.red, x + 1, y + 2, 14, 4);
    rect(ctx, C.white, x + 5, y + 2, 3, 4);
  },
  shell(ctx, x, y) {
    rect(ctx, C.white, x + 6, y + 8, 4, 3);
    rect(ctx, C.terracotta, x + 7, y + 9, 2, 1);
  },
  cancha(ctx, x, y, d) {
    const w = (d.w ?? 8) * S;
    const h = (d.h ?? 5) * S;
    rect(ctx, C.pitch, x, y, w, h);
    rect(ctx, C.pitchLine, x + 2, y + 2, w - 4, 1);
    rect(ctx, C.pitchLine, x + 2, y + h - 3, w - 4, 1);
    rect(ctx, C.pitchLine, x + 2, y + 2, 1, h - 4);
    rect(ctx, C.pitchLine, x + w - 3, y + 2, 1, h - 4);
    rect(ctx, C.pitchLine, x + w / 2, y + 2, 1, h - 4);
    rect(ctx, C.pitchLine, x + w / 2 - 3, y + h / 2 - 3, 7, 7);
    rect(ctx, C.pitch, x + w / 2 - 2, y + h / 2 - 2, 5, 5);
  },
  salchipapas(ctx, x, y) {
    rect(ctx, C.white, x + 3, y + 8, 10, 4);
    rect(ctx, C.potato, x + 4, y + 5, 8, 3);
    rect(ctx, C.red, x + 6, y + 4, 4, 2);
  },
  cervezaAguila(ctx, x, y) {
    rect(ctx, C.beer, x + 6, y + 6, 4, 7);
    rect(ctx, C.red, x + 6, y + 9, 4, 2);
    rect(ctx, C.beer, x + 7, y + 3, 2, 3);
  },
  arrozCoco(ctx, x, y) {
    rect(ctx, C.white, x + 3, y + 5, 10, 7);
    rect(ctx, C.seaFoam, x + 4, y + 6, 8, 3);
    rect(ctx, C.potato, x + 4, y + 9, 8, 2);
  },
  bed() {}, // la cama ya la dibuja el tile
};

flatPainter.decor = function decor(ctx, d, x, y) {
  // Primero el piso que el mueble tapa, para que no quede la caja de FURNITURE.
  if (d.under !== undefined && d.kind !== "bed") {
    for (let dy = 0; dy < (d.h ?? 1); dy++) {
      for (let dx = 0; dx < (d.w ?? 1); dx++) {
        flatPainter(ctx, d.under, x + dx * S, y + dy * S, d.tx + dx, d.ty + dy);
      }
    }
  }
  const fn = DECOR[d.kind];
  if (fn) fn(ctx, x, y, d);
  else rect(ctx, "#ff00ff", x + 6, y + 6, 4, 4); // tipo nuevo sin dibujo: que se note
};

// Color del borde sutil de cada zona.
const ZONE_COLORS = {
  "Main Entrance": C.sun,
  "Reception": C.glass,
  "Waiting Room": C.glass,
  "Cafeteria": C.red,
  "Administrative Block": C.trunk,
  "Maintenance Area": C.sun,
  "Main Hallway": C.mint,
  "Sterilization Unit": C.glassLight,
};

flatPainter.zoneBorder = function zoneBorder(ctx, zone, x, y, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = ZONE_COLORS[zone.location] ?? C.mint;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
};

/**
 * Dibuja el mapa visible por la cámara. Solo recorre los tiles en pantalla.
 * Deja el contexto como lo encontró.
 * @param {CanvasRenderingContext2D} ctx
 * @param {World} world
 * @param {Camera} camera
 * @param {Function} [painter]
 */
export function drawWorld(ctx, world, camera, painter = flatPainter) {
  const z = camera.zoom;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // Fondo para lo que queda fuera del mundo cuando el mapa es más chico.
  ctx.fillStyle = C.garden;
  ctx.fillRect(0, 0, camera.viewW, camera.viewH);

  ctx.translate(-camera.offsetX, -camera.offsetY);
  ctx.scale(z, z);

  const view = visibleTiles(world, camera);
  for (let ty = view.ty0; ty <= view.ty1; ty++) {
    for (let tx = view.tx0; tx <= view.tx1; tx++) {
      painter(ctx, world.tiles[ty * world.cols + tx], tx * S, ty * S, tx, ty);
    }
  }

  if (painter.decor) {
    for (const d of world.decor) {
      const w = d.w ?? 1;
      const h = d.h ?? 1;
      if (d.tx + w - 1 < view.tx0 || d.tx > view.tx1 || d.ty + h - 1 < view.ty0 || d.ty > view.ty1) continue;
      painter.decor(ctx, d, d.tx * S, d.ty * S);
    }
  }

  if (painter.zoneBorder) {
    for (const zone of world.zones) {
      const r = zone.rect;
      if (r.tx + r.w - 1 < view.tx0 || r.tx > view.tx1 || r.ty + r.h - 1 < view.ty0 || r.ty > view.ty1) continue;
      painter.zoneBorder(ctx, zone, r.tx * S, r.ty * S, r.w * S, r.h * S);
    }
  }
  ctx.restore();
}

/** Rango de tiles {tx0, ty0, tx1, ty1} (inclusive) que la cámara ve. */
export function visibleTiles(world, camera) {
  const x0 = camera.offsetX / camera.zoom;
  const y0 = camera.offsetY / camera.zoom;
  return {
    tx0: Math.max(0, Math.floor(x0 / S)),
    ty0: Math.max(0, Math.floor(y0 / S)),
    tx1: Math.min(world.cols - 1, Math.floor((x0 + camera.visibleW - 1) / S)),
    ty1: Math.min(world.rows - 1, Math.floor((y0 + camera.visibleH - 1) / S)),
  };
}
