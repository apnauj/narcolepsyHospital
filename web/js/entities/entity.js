// Entidad del mapa (contrato, sección 5) y su movimiento sobre la grilla.
//
// (x, y) es el centro de la entidad en píxeles de mundo: el centro del tile
// donde está parada, o un punto intermedio mientras camina entre dos tiles.
// `tile` es el último tile lógico que alcanzó y es el que usan A* y las
// reservas. Las entidades no se dibujan solas: eso lo hace un renderer.

import { TILE_SIZE } from "../world/index.js";

/** Velocidades en px de mundo por segundo (ya multiplicadas por la velocidad del juego en dt). */
export const SPEED = Object.freeze({
  patient: 40,
  staff: 52, // un poco más rápido que los pacientes
  robot: 60, // constante, lleve carga o no
});

/** Clases de entidad que dibuja el renderer. */
export const KINDS = Object.freeze(["patient", "doctor", "orderly", "other", "robot"]);

const S = TILE_SIZE;
const EPS = 1e-6;

/** Centro de un tile en px de mundo. */
export function tileCenter(t) {
  return { x: t.tx * S + S / 2, y: t.ty * S + S / 2 };
}

/** Tile que contiene un punto de mundo. */
export function tileAtPoint(x, y) {
  return { tx: Math.floor(x / S), ty: Math.floor(y / S) };
}

/** Clave "tx,ty" que usan `occupied` de findPath y las reservas. */
export function tileKey(t) {
  return `${t.tx},${t.ty}`;
}

export function sameTile(a, b) {
  return Boolean(a && b) && a.tx === b.tx && a.ty === b.ty;
}

/** Distancia Manhattan entre dos tiles. */
export function manhattan(a, b) {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
}

/** Dirección ("up" | "down" | "left" | "right") de un desplazamiento; el eje mayor manda. */
export function dirOf(dx, dy, fallback = "down") {
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/** Velocidad por clase: personal más rápido que pacientes, robots constantes. */
export function speedFor(kind) {
  if (kind === "patient") return SPEED.patient;
  if (kind === "robot") return SPEED.robot;
  return SPEED.staff;
}

/**
 * Entidad del contrato. Los campos públicos son los del contrato (kind, id,
 * x, y, dir, anim, animTime, carrying, flags.alert); el resto lo usan el
 * director y las tareas.
 */
export class Entity {
  /**
   * @param {"patient"|"doctor"|"orderly"|"other"|"robot"} kind
   * @param {string} id
   * @param {{tx:number, ty:number}} tile tile inicial
   */
  constructor(kind, id, tile) {
    this.kind = kind;
    this.id = id;
    const c = tileCenter(tile);
    this.x = c.x;
    this.y = c.y;
    this.tile = { tx: tile.tx, ty: tile.ty };
    /** @type {"down"|"up"|"left"|"right"} */
    this.dir = "down";
    /** @type {"idle"|"walk"|"attack"|"sleep"|"stretcher"|"attend"|"wake"|"push"} */
    this.anim = "idle";
    this.animTime = 0;
    /** @type {string|undefined} ID del paciente que lleva en camilla. */
    this.carrying = undefined;
    this.flags = { alert: false };
    this.speed = speedFor(kind);

    // Uso interno del director y las tareas.
    /** Estado de la máquina visual (p. ej. "Caminando", "Patrullando", "EnBase"). */
    this.state = "";
    /** Tarea en curso y cola de tareas pendientes (ver tasks.js). */
    this.task = null;
    this.tasks = [];
    /** true mientras recorre un camino. */
    this.moving = false;
  }

  /** Cambia la animación; reinicia el reloj solo si cambia. */
  setAnim(anim) {
    if (this.anim !== anim) {
      this.anim = anim;
      this.animTime = 0;
    }
  }

  /** Pone la entidad en el centro de un tile. */
  placeAt(tile) {
    const c = tileCenter(tile);
    this.x = c.x;
    this.y = c.y;
    this.tile = { tx: tile.tx, ty: tile.ty };
  }

  /** true si está (casi) en el centro de su tile lógico. */
  atTileCenter() {
    const c = tileCenter(this.tile);
    return Math.abs(this.x - c.x) < EPS && Math.abs(this.y - c.y) < EPS;
  }

  /** Mira hacia un punto de mundo. */
  face(x, y) {
    this.dir = dirOf(x - this.x, y - this.y, this.dir);
  }
}

/**
 * Avanza `dist` px por un recorrido `walk = { path, checked }`: `path` son los
 * tiles pendientes (el primero es el siguiente destino) y `checked` dice si
 * ya se consultó `canEnter` para ese primer tile. Actualiza x, y, tile y dir
 * y consume los tiles alcanzados.
 *
 * `canEnter(tile)` se consulta una vez por tile, justo antes de salir hacia
 * él desde el centro del tile actual: si devuelve false, la entidad se queda
 * quieta para que quien la mueve re-planifique.
 * @returns {{ arrived: boolean, blocked: boolean }}
 */
export function moveAlong(entity, walk, dist, canEnter = () => true) {
  const { path } = walk;
  while (path.length > 0) {
    const next = path[0];
    if (!walk.checked && entity.atTileCenter()) {
      if (!canEnter(next)) return { arrived: false, blocked: true };
      walk.checked = true;
    }
    const c = tileCenter(next);
    const dx = c.x - entity.x;
    const dy = c.y - entity.y;
    const len = Math.hypot(dx, dy);
    entity.dir = dirOf(dx, dy, entity.dir);
    if (len > dist + EPS) {
      entity.x += (dx / len) * dist;
      entity.y += (dy / len) * dist;
      return { arrived: false, blocked: false };
    }
    entity.x = c.x;
    entity.y = c.y;
    entity.tile = { tx: next.tx, ty: next.ty };
    path.shift();
    walk.checked = false;
    dist -= len;
    if (dist <= EPS) break;
  }
  return { arrived: path.length === 0, blocked: false };
}
