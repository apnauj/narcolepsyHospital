// Decoración animada encima del mapa, a partir de world.decor.
//
// Qué se anima (ANIMATED_DECOR):
//   fan      ventilador de techo: aspas que giran sobre un disco borroso
//   tv       TV de la sala de espera: partido del Junior en 3 cuadros y «GOL»
//   monitor  monitor cardíaco: línea que late solo si la cama está ocupada
//   charger  cargador de la base de camillas: luz verde y barra que se llena
//            con un robot en su puesto; luz roja lenta si el puesto está vacío
//   pico     picó: parlante que bombea y ecualizador (las notas son partículas)
// Se dibuja SOLO el efecto encima de lo que pintó el painter (flatPainter o
// el arte); nunca se repinta el tile. Las coordenadas son de mundo (el
// contexto llega trasladado y escalado como en drawWorld). Las posiciones
// relativas siguen el dibujo de flatPainter.decor en world/render.js.

import { roomAt, TILE_SIZE } from "../world/index.js";
import { FX_COLORS as C, hash2, rect } from "./pixel.js";

/** Tipos de decor que tienen animación. */
export const ANIMATED_DECOR = Object.freeze(["fan", "tv", "monitor", "charger", "pico"]);

export const FAN_FPS = 12;
export const TV_FPS = 3;
/** Cada cuánto hay «GOL» en la TV, y cuánto dura. */
export const TV_GOAL_EVERY = 7;
export const TV_GOAL_TIME = 0.8;
export const ECG_SPEED = 10; // columnas por segundo
/** Golpe del picó: champeta a 120 bpm. */
export const PICO_BEAT = 0.5;

const S = TILE_SIZE;
const ECG = [3, 3, 3, 3, 3, 2, 3, 3, 0, 5, 3, 3, 2, 2, 3, 3]; // fila por columna (0 = arriba)

/**
 * Lista de decor animados del mundo, con datos extra:
 *   monitor -> room (número de la habitación donde está, 0 si ninguna)
 *   charger -> pad (puesto de carga {tx, ty} que le corresponde)
 */
export function animatedDecor(world) {
  const out = [];
  for (const d of world?.decor ?? []) {
    if (!ANIMATED_DECOR.includes(d.kind)) continue;
    const item = { kind: d.kind, tx: d.tx, ty: d.ty, w: d.w ?? 1, h: d.h ?? 1 };
    if (d.kind === "monitor") item.room = roomAt(world, d.tx, d.ty)?.number ?? 0;
    if (d.kind === "charger") item.pad = nearestPad(world.robotBase ?? [], d);
    out.push(item);
  }
  return out;
}

// Puesto de carga más cercano a un cargador de muro (normalmente justo debajo).
function nearestPad(pads, d) {
  let best = null;
  let bestDist = Infinity;
  for (const p of pads) {
    const dist = Math.abs(p.tx - d.tx) + Math.abs(p.ty - d.ty);
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best && bestDist <= 2 ? { tx: best.tx, ty: best.ty } : null;
}

/** Cuadro (0..3) de las aspas del ventilador. */
export function fanFrame(t) {
  return Math.floor(t * FAN_FPS) % 4;
}

/** Cuadro de la TV: 0..2 juego, 3 = «GOL». */
export function tvFrame(t) {
  if (t % TV_GOAL_EVERY >= TV_GOAL_EVERY - TV_GOAL_TIME) return 3;
  return Math.floor(t * TV_FPS) % 3;
}

/** Desplazamiento de la línea del monitor. */
export function ecgOffset(t) {
  return Math.floor(t * ECG_SPEED) % ECG.length;
}

/** Golpe del picó: índice del golpe y si está en la parte «fuerte». */
export function picoBeat(t) {
  const beat = Math.floor(t / PICO_BEAT);
  return { beat, thump: t - beat * PICO_BEAT < 0.12 };
}

/**
 * Habitaciones cuyo monitor late: ocupadas según el snapshot y, si hay
 * director, con el paciente ya acostado en esa cama en el mapa.
 */
export function occupiedRooms(snapshot, director) {
  const out = new Set();
  for (const r of snapshot?.rooms ?? []) {
    const occupants = r.occupants ?? [];
    if (occupants.length === 0) continue;
    if (typeof director?.bedOf === "function") {
      if (occupants.some((id) => director.bedOf(id) === r.number)) out.add(r.number);
    } else {
      out.add(r.number);
    }
  }
  return out;
}

/**
 * Puestos de carga ("tx,ty") con un robot quieto y sin carga encima.
 * @param {Array<{kind, x, y, carrying?, state?}>} entities
 */
export function dockedPads(entities) {
  const out = new Set();
  for (const e of entities ?? []) {
    if (e.kind !== "robot" || e.carrying) continue;
    if (e.state && e.state !== "EnBase") continue;
    const tx = Math.floor(e.x / S);
    const ty = Math.floor(e.y / S);
    const cx = tx * S + S / 2;
    const cy = ty * S + S / 2;
    if (Math.abs(e.x - cx) < 1 && Math.abs(e.y - cy) < 1) out.add(`${tx},${ty}`);
  }
  return out;
}

/**
 * true si el decor se anima con el estado actual. El monitor solo late con
 * su cama ocupada; el resto siempre (el cargador cambia de luz, pero se ve).
 */
export function isAnimating(item, { occupied = new Set() } = {}) {
  if (item.kind === "monitor") return occupied.has(item.room);
  return ANIMATED_DECOR.includes(item.kind);
}

// ---------------------------------------------------------------------------
// Dibujo. (x, y) = esquina del tile en px de mundo.

/** Aspas del ventilador: disco borroso y 4 aspas que giran de a 22,5°. */
export function drawFan(ctx, x, y, t) {
  const frame = fanFrame(t);
  ctx.save();
  ctx.globalAlpha = 0.12;
  rect(ctx, C.dark, x + 3, y + 2, 10, 12);
  rect(ctx, C.dark, x + 2, y + 3, 12, 10);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = C.dark;
  const a0 = (frame * Math.PI) / 8;
  for (let k = 0; k < 4; k++) {
    const a = a0 + (k * Math.PI) / 2;
    // Radios de media en media para que las aspas queden simétricas (x+2..x+13).
    for (const r of [2.5, 3.5, 4.5, 5.5]) {
      ctx.fillRect(Math.round(x + 7.5 + r * Math.cos(a)), Math.round(y + 7.5 + r * Math.sin(a)), 1, 1);
    }
  }
  ctx.restore();
  rect(ctx, C.steel, x + 6, y + 6, 4, 4);
  rect(ctx, C.ink, x + 7, y + 7, 2, 2);
}

// Dónde cae cada pantalla dentro de su sprite (px desde la esquina del tile).
// Salen de las grillas de tools/spritegen: si cambia un sprite, se ajusta aquí.
export const SCREENS = Object.freeze({
  tv: { x: 1, y: 3, w: 14, h: 5 },
  monitor: { x: 3, y: 3, w: 10, h: 5 },
  chargerBar: { x: 7, y: 3, w: 2, h: 3 },
  chargerLight: { x: 6, y: 7 },
  picoEq: { x: 2, y: 2, w: 12, h: 3 },
  picoSpeaker: { x: 3, y: 5, w: 10, h: 6 },
});

/** Partido en la pantalla de la TV. */
export function drawTv(ctx, x, y, t) {
  const { w, h } = SCREENS.tv;
  const sx = x + SCREENS.tv.x;
  const sy = y + SCREENS.tv.y;
  const frame = tvFrame(t);
  if (frame === 3) {
    // «GOL»: la pantalla destella en amarillo y rojo.
    const flash = Math.floor(t * 8) % 2 === 0;
    rect(ctx, flash ? C.sun : C.red, sx, sy, w, h);
    rect(ctx, flash ? C.red : C.white, sx + 2, sy + 1, w - 4, h - 2);
    rect(ctx, flash ? C.white : C.red, sx + Math.floor(w / 2) - 1, sy + Math.floor(h / 2), 2, 1);
    return;
  }
  rect(ctx, C.grass, sx, sy, w, h);
  for (let cx = 0; cx < w; cx += 4) rect(ctx, C.grassDark, sx + cx, sy, 2, h);
  rect(ctx, C.white, sx + Math.floor(w / 2), sy, 1, h); // línea de mitad de cancha
  const goalY = sy + Math.floor((h - 2) / 2);
  rect(ctx, C.white, sx, goalY, 1, 2); // arcos
  rect(ctx, C.white, sx + w - 1, goalY, 1, 2);
  // Jugadas en una cancha de 12×8, escaladas a la pantalla: el Junior (rojo
  // y blanco), el rival (azul) y el balón.
  const PLAYS = [
    { ball: [5, 4], junior: [3, 3], rival: [8, 5] },
    { ball: [7, 3], junior: [5, 3], rival: [8, 3] },
    { ball: [9, 4], junior: [7, 4], rival: [10, 2] },
  ];
  const at = ([px, py]) => [sx + Math.floor((px * w) / 12), sy + Math.min(h - 2, Math.floor((py * h) / 8))];
  const p = PLAYS[frame];
  const [jx, jy] = at(p.junior);
  const [rx, ry] = at(p.rival);
  const [bx, by] = at(p.ball);
  rect(ctx, C.red, jx, jy, 1, 1);
  rect(ctx, C.white, jx, jy + 1, 1, 1);
  rect(ctx, C.blue, rx, ry, 1, 2);
  rect(ctx, C.white, bx, by, 1, 1);
  rect(ctx, C.sky, sx, sy, 2, 1); // brillo del vidrio
}

/** Línea del monitor cardíaco y su lucecita roja. */
export function drawMonitor(ctx, x, y, t) {
  const { w, h } = SCREENS.monitor;
  const sx = x + SCREENS.monitor.x;
  const sy = y + SCREENS.monitor.y;
  const off = ecgOffset(t);
  // ECG está pensado para 6 filas; se aplasta a las h de la pantalla.
  const rowOf = (i) => Math.min(h - 1, Math.round((ECG[i % ECG.length] * (h - 1)) / 5));
  rect(ctx, C.dark, sx, sy, w, h);
  // Cada columna une su punto con el anterior: la línea queda continua.
  let prev = rowOf(off);
  for (let i = 0; i < w; i++) {
    const row = rowOf(i + off);
    const top = Math.min(prev, row);
    rect(ctx, i === w - 1 ? C.mint : C.leaf, sx + i, sy + top, 1, Math.max(prev, row) - top + 1);
    prev = row;
  }
  // La luz se prende cuando el pico del latido pasa por la punta.
  const tip = (w - 1 + off) % ECG.length;
  if (tip === 8 || tip === 9) rect(ctx, C.red, sx + w - 1, sy, 1, 1);
}

/** Cargador: luz y barra de carga. `docked` = hay robot en su puesto. */
export function drawCharger(ctx, x, y, t, docked) {
  const bar = SCREENS.chargerBar;
  const light = SCREENS.chargerLight;
  if (docked) {
    const level = Math.floor(t * 5) % (bar.h + 1); // 0..h px
    rect(ctx, C.dark, x + bar.x, y + bar.y, bar.w, bar.h);
    if (level > 0) rect(ctx, C.leaf, x + bar.x, y + bar.y + bar.h - level, bar.w, level);
    if (Math.floor(t * 4) % 2 === 0) rect(ctx, C.grass, x + light.x, y + light.y, 1, 1);
  } else if (t % 1 < 0.3) {
    rect(ctx, C.red, x + light.x, y + light.y, 1, 1);
  }
}

/** Picó: ecualizador en el panel rojo y parlante que bombea al golpe. */
export function drawPico(ctx, x, y, t) {
  const { beat, thump } = picoBeat(t);
  const eq = SCREENS.picoEq;
  const sp = SCREENS.picoSpeaker;
  rect(ctx, C.dark, x + eq.x, y + eq.y, eq.w, eq.h);
  const bars = Math.floor(eq.w / 2);
  for (let i = 0; i < bars; i++) {
    const hgt = 1 + (hash2(beat, i) % eq.h);
    const bx = x + eq.x + 1 + i * 2;
    const by = y + eq.y + eq.h - hgt;
    rect(ctx, C.red, bx, by, 1, hgt);
    rect(ctx, C.sun, bx, by, 1, 1);
  }
  if (thump) {
    rect(ctx, C.sun, x + sp.x, y + sp.y, sp.w, sp.h);
    rect(ctx, C.leaf, x + sp.x + 2, y + sp.y + 1, sp.w - 4, sp.h - 2);
    rect(ctx, C.ink, x + sp.x + Math.floor(sp.w / 2) - 1, y + sp.y + Math.floor(sp.h / 2) - 1, 2, 2);
  }
}

/**
 * Dibuja un decor animado. `state` trae occupied (Set de habitaciones) y
 * docked (Set "tx,ty" de puestos con robot).
 */
export function drawAnimatedDecor(ctx, item, t, state) {
  const x = item.tx * S;
  const y = item.ty * S;
  switch (item.kind) {
    case "fan":
      return drawFan(ctx, x, y, t + item.tx * 0.07); // cada ventilador en su fase
    case "tv":
      return drawTv(ctx, x, y, t);
    case "monitor":
      if (state.occupied?.has(item.room)) drawMonitor(ctx, x, y, t + item.room * 0.13);
      return undefined;
    case "charger":
      return drawCharger(ctx, x, y, t, Boolean(item.pad && state.docked?.has(`${item.pad.tx},${item.pad.ty}`)));
    case "pico":
      return drawPico(ctx, x, y, t);
    default:
      return undefined;
  }
}
