// Renderer de entidades con sprites. Misma interfaz que SquareRenderer
// ({ drawEntity(ctx, entity, sx, sy), portrait(kind, id) }); todo sale del
// manifest (filas, frames, anclas, ride), el código no conoce coordenadas.
//
// Convenciones:
// - (sx, sy) es el centro del tile de la entidad. Los que caminan se dibujan
//   con el ancla (los pies) FOOT_DY px más abajo, para que se vean parados
//   dentro del tile y la cabeza sobresalga hacia arriba. Es entero y el
//   contexto ya viene escalado por el zoom, así que el pixel art queda nítido.
// - Paciente en cama: usa el `ride` del sprite de la cama (hay que darle el
//   mundo con setWorld para saber dónde está cada cama).
// - Paciente cargado: sobre el robot (ride del robot) o sobre la camilla del
//   camillero (la camilla la dibuja el propio paciente, ride de la camilla).
// - El emote «!» solo sale con flags.alert (alerta permanente: está en las
//   dos colas). En `attack` el «!» ya viene dibujado en el frame de la hoja,
//   así que no se duplica.

import {
  animFrame, characterFrame, spriteFrame, emoteFrame, objectFor,
} from "./sheets.js";
import { appearanceFor, staffAppearanceFor, layersFor } from "./layers.js";

/** Desplazamiento vertical de los pies respecto al centro del tile. */
export const FOOT_DY = 4;
const SHADOW_ALPHA = 0.35;
const PORTRAIT = 20;

// Animaciones en las que el cuerpo va acostado (cabeza a la izquierda).
const LYING = new Set(["sleep", "stretcher"]);
// Animaciones que, en una cama, se dibujan con el ride de la cama.
const IN_BED = new Set(["sleep", "wake"]);

const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function makeCanvas(w, h) {
  if (typeof document !== "undefined" && document.createElement) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  return null;
}

export class SpriteRenderer {
  /**
   * @param {Art} art  resultado de loadArt()
   * @param {{world?: object, createCanvas?: (w:number,h:number)=>any}} [opts]
   */
  constructor(art, { world = null, createCanvas = makeCanvas } = {}) {
    this.art = art;
    this.createCanvas = createCanvas;
    this.looks = new Map(); // "kind:id" -> capas
    this.portraits = new Map();
    this.beds = new Map(); // "x,y" (centro de la cama en px) -> {decor, sprite}
    this.robotAt = new Map(); // id del paciente -> posición del robot que lo lleva
    if (world) this.setWorld(world);
  }

  /** Registra las camas del mundo: el paciente dormido en una usa su `ride`. */
  setWorld(world) {
    this.beds.clear();
    for (const d of world.decor ?? []) {
      if (d.kind !== "bed") continue;
      const sprite = objectFor(this.art, d);
      if (!sprite) continue;
      const [vx, vy] = DIR_VEC[d.dir] ?? DIR_VEC.down;
      // Centro de la cama: entre el tile de la cabecera y el de los pies.
      const cx = d.tx * 16 + 8 + vx * 8;
      const cy = d.ty * 16 + 8 + vy * 8;
      this.beds.set(`${cx},${cy}`, { decor: d, sprite });
    }
  }

  /** Capas del personaje (cacheadas por tipo e ID). */
  layersOf(kind, id) {
    const key = `${kind}:${id}`;
    let l = this.looks.get(key);
    if (!l) {
      const look = kind === "patient" ? appearanceFor(id, this.art) : staffAppearanceFor(kind, id, this.art);
      l = layersFor(look, this.art);
      this.looks.set(key, l);
    }
    return l;
  }

  drawEntity(ctx, e, sx, sy) {
    ctx.imageSmoothingEnabled = false;
    const cx = Math.round(sx);
    const cy = Math.round(sy);
    if (e.kind === "robot") this.drawRobot(ctx, e, cx, cy);
    else this.drawPerson(ctx, e, cx, cy);
  }

  // --- Robot ---------------------------------------------------------------

  drawRobot(ctx, e, cx, cy) {
    const { robot } = this.art;
    const bx = cx;
    const by = cy + FOOT_DY;
    this.drawShadow(ctx, bx, by, 1.6);
    // La sirena (frames rojo/azul) solo gira cuando lleva a alguien.
    const frame = e.carrying ? Math.floor(Math.max(0, e.animTime ?? 0) * robot.fps) % robot.frames : 0;
    this.blit(ctx, robot, spriteFrame(robot, frame), bx - robot.anchor.x, by - robot.anchor.y);
    if (e.carrying) this.robotAt.set(e.carrying, { x: cx, y: cy });
    if (e.flags?.alert) this.drawAlert(ctx, e, bx, by - robot.anchor.y - 2);
  }

  // --- Pacientes y personal --------------------------------------------------

  drawPerson(ctx, e, cx, cy) {
    const art = this.art;
    const anim = art.characters.animations[e.anim] ? e.anim : "idle";
    const dir = e.dir ?? "down";
    const frame = animFrame(art, anim, e.animTime ?? 0);
    const rect = characterFrame(art, anim, dir, frame);
    const layers = this.layersOf(e.kind, e.id);
    const bx = cx;
    const by = cy + FOOT_DY;
    let top = by - art.characters.anchor.y; // para ubicar el «!»

    if (e.kind === "patient" && e.carriedBy) {
      top = this.drawCarried(ctx, e, layers, rect, cx, cy);
    } else if (e.kind === "patient" && IN_BED.has(anim) && this.beds.has(`${cx},${cy}`)) {
      const { decor, sprite } = this.beds.get(`${cx},${cy}`);
      const left = decor.tx * 16 - sprite.origin.x;
      const up = decor.ty * 16 - sprite.origin.y;
      // Dormido: acostado con el giro de la cama; despertando: sentado, sin girar.
      this.drawRide(ctx, layers, rect, left, up, sprite.ride, LYING.has(anim));
      top = up + sprite.ride.y - 16;
    } else {
      this.drawShadow(ctx, bx, by, 1);
      const flip = anim === "sleep" && dir === "right";
      this.drawLayers(ctx, layers, rect, bx - art.characters.anchor.x, by - art.characters.anchor.y, flip);
    }
    if (e.flags?.alert) this.drawAlert(ctx, e, cx, top - 2);
  }

  // Paciente sobre el robot o sobre la camilla. Devuelve el borde de arriba.
  drawCarried(ctx, e, layers, rect, cx, cy) {
    const art = this.art;
    const bx = cx;
    const by = cy + FOOT_DY;
    const robot = this.robotAt.get(e.id);
    if (robot && robot.x === cx && robot.y === cy) {
      // El robot ya se dibujó en esta misma posición: solo va encima.
      const r = art.robot;
      this.drawRide(ctx, layers, rect, bx - r.anchor.x, by - r.anchor.y, r.ride, true);
      return by - r.anchor.y + r.ride.y - 14;
    }
    const s = art.stretcher;
    this.drawShadow(ctx, bx, by, 1.4);
    const left = bx - s.anchor.x;
    const top = by - s.anchor.y;
    this.blit(ctx, s, spriteFrame(s, 0), left, top);
    this.drawRide(ctx, layers, rect, left, top, s.ride, true);
    return top + s.ride.y - 14;
  }

  // Capas de una celda, en orden, con la esquina de arriba a la izquierda en (x, y).
  drawLayers(ctx, layers, rect, x, y, flip = false) {
    if (flip) {
      ctx.save();
      ctx.translate(x + rect.sw, y);
      ctx.scale(-1, 1);
      x = 0;
      y = 0;
    }
    for (const l of layers) {
      if (!l.image) continue;
      ctx.drawImage(l.image, rect.sx, rect.sy, rect.sw, rect.sh, x, y, rect.sw, rect.sh);
    }
    if (flip) ctx.restore();
  }

  // Dibuja las capas con el centro del frame en (left+ride.x, top+ride.y),
  // girado y reflejado como dice el ride (ver SPRITESHEETS.md, "Ride").
  drawRide(ctx, layers, rect, left, top, ride, rotate) {
    ctx.save();
    ctx.translate(left + ride.x, top + ride.y);
    if (rotate) ctx.rotate((ride.rotate * Math.PI) / 180);
    ctx.scale(ride.flipX ? -1 : 1, 1);
    for (const l of layers) {
      if (!l.image) continue;
      ctx.drawImage(l.image, rect.sx, rect.sy, rect.sw, rect.sh, -rect.sw / 2, -rect.sh / 2, rect.sw, rect.sh);
    }
    ctx.restore();
  }

  // --- Piezas comunes --------------------------------------------------------

  blit(ctx, entry, r, x, y) {
    if (entry.image) ctx.drawImage(entry.image, r.sx, r.sy, r.sw, r.sh, x, y, r.sw, r.sh);
  }

  /** Sombra ovalada semitransparente; `k` la agranda (robot, camilla). */
  drawShadow(ctx, bx, by, k) {
    const sh = this.art.shadow;
    if (!sh.image) return;
    const w = Math.round(sh.frame.w * k);
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = SHADOW_ALPHA;
    ctx.drawImage(sh.image, 0, 0, sh.frame.w, sh.frame.h, bx - Math.round(sh.anchor.x * k), by - sh.anchor.y, w, sh.frame.h);
    ctx.globalAlpha = prev;
  }

  /** Emote de alerta sobre la cabeza, con un saltito. */
  drawAlert(ctx, e, x, bottom) {
    const em = this.art.emotes;
    if (!em.image) return;
    const r = emoteFrame(this.art, "alert");
    const bob = Math.floor(Math.max(0, e.animTime ?? 0) * 3) % 2;
    ctx.drawImage(em.image, r.sx, r.sy, r.sw, r.sh, x - r.sw / 2, bottom - r.sh - bob, r.sw, r.sh);
  }

  /**
   * Retrato para el panel de colas: cabeza y torso del personaje mirando de
   * frente (frame idle abajo), en un canvas de 20×20. Cacheado por tipo e ID.
   * Devuelve null si no hay canvas (p. ej. en Node).
   */
  portrait(kind, id) {
    const key = `${kind}:${id}`;
    if (this.portraits.has(key)) return this.portraits.get(key);
    const canvas = this.createCanvas(PORTRAIT, PORTRAIT);
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      const r = characterFrame(this.art, "idle", "down", 0);
      // Filas 3..17 del frame: del sombrero al torso, sin las piernas.
      for (const l of this.layersOf(kind, id)) {
        if (l.image) ctx.drawImage(l.image, r.sx, r.sy + 3, r.sw, 15, 0, 3, r.sw, 15);
      }
    }
    this.portraits.set(key, canvas);
    return canvas;
  }
}
