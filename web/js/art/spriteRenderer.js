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
// - Efectos («!», «Zzz», estrellitas, sirena del robot): NO se dibujan aquí.
//   Los pinta web/js/fx encima, y las hojas se generan sin ellos
//   (BakeFX = false en tools/spritegen). Por eso el robot es siempre el
//   frame 0 y no hay emote de alerta.

import {
  animFrame, characterFrame, spriteFrame, objectFor,
} from "./sheets.js";
import { appearanceFor, staffAppearanceFor, layersFor } from "./layers.js";

/** Desplazamiento vertical de los pies respecto al centro del tile. */
export const FOOT_DY = 4;
const SHADOW_ALPHA = 0.35;
const PORTRAIT = 20;

// Animaciones en las que el cuerpo va acostado. Sus filas en la hoja son
// direccionales: la dirección es la de la cama (de la cabecera a los pies).
const LYING = new Set(["sleep", "stretcher"]);
// Animaciones que, en una cama, se dibujan con el ride de la cama.
const IN_BED = new Set(["sleep", "wake"]);
// Distancia máxima (px) entre el paciente y el centro de una cama para
// considerarlo acostado en ella.
const BED_SNAP = 6;

// Dirección de la fila acostada para quien duerme en el suelo.
function floorLie(dir) {
  if (dir === "right") return "left"; // cabeza a la derecha
  return "right"; // cabeza a la izquierda
}

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

  /**
   * Cama en la que está acostado quien está en (wx, wy), en px de MUNDO.
   * Se busca por el mundo y no por la pantalla: (sx, sy) cambia con la
   * cámara y solo coincidiría con la cama con la cámara en el origen.
   */
  bedAt(wx, wy) {
    const exact = this.beds.get(`${Math.round(wx)},${Math.round(wy)}`);
    if (exact) return exact;
    for (const [key, bed] of this.beds) {
      const [bx, by] = key.split(",").map(Number);
      if (Math.abs(bx - wx) <= BED_SNAP && Math.abs(by - wy) <= BED_SNAP) return bed;
    }
    return null;
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
    this.blit(ctx, robot, spriteFrame(robot, 0), bx - robot.anchor.x, by - robot.anchor.y);
    if (e.carrying) this.robotAt.set(e.carrying, { x: cx, y: cy });
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

    if (e.kind === "patient" && e.carriedBy) {
      this.drawCarried(ctx, e, layers, rect, cx, cy);
    } else if (e.kind === "patient" && IN_BED.has(anim) && this.bedAt(e.x, e.y)) {
      this.drawInBed(ctx, e, anim, layers, cx, cy);
    } else {
      this.drawShadow(ctx, bx, by, 1);
      // Dormido fuera de una cama: acostado con la cabeza hacia el lado
      // contrario al que mira (mirando a la derecha, cabeza a la derecha).
      const lyRect = LYING.has(anim) ? characterFrame(art, anim, floorLie(dir), frame) : rect;
      this.drawLayers(ctx, layers, lyRect, bx - art.characters.anchor.x, by - art.characters.anchor.y, false);
    }
  }

  /**
   * Paciente en una cama. Dormido: el frame acostado de la fila de la
   * dirección de la cama (cabeza en la cabecera, a lo largo del colchón),
   * ubicado con el `ride` del sprite. Despertando: sentado (frame `wake`,
   * sin girar) en el punto `sit` (o en `ride` si el sprite no trae `sit`).
   * Al final repinta la manta (`cover`) encima del paciente.
   */
  drawInBed(ctx, e, anim, layers, cx, cy) {
    const { decor, sprite } = this.bedAt(e.x, e.y);
    // La cama está en px de mundo; (cx, cy) es el paciente en pantalla.
    const ox = cx - Math.round(e.x);
    const oy = cy - Math.round(e.y);
    const left = decor.tx * 16 - sprite.origin.x + ox;
    const top = decor.ty * 16 - sprite.origin.y + oy;
    const dir = decor.dir ?? "down";
    const frame = animFrame(this.art, anim, e.animTime ?? 0);
    if (LYING.has(anim)) {
      const rect = characterFrame(this.art, anim, dir, frame);
      this.drawRide(ctx, layers, rect, left, top, sprite.ride, true);
    } else {
      const rect = characterFrame(this.art, anim, "down", frame);
      const at = sprite.sit ? { x: sprite.sit.x, y: sprite.sit.y, rotate: 0, flipX: false } : { ...sprite.ride, rotate: 0, flipX: false };
      this.drawRide(ctx, layers, rect, left, top, at, false);
    }
    this.drawCover(ctx, sprite, left, top);
  }

  /** Repinta la manta de una cama encima del paciente. */
  drawCover(ctx, sprite, left, top) {
    const c = sprite.cover;
    if (!c || !sprite.image) return;
    const f = spriteFrame(sprite, 0);
    ctx.drawImage(sprite.image, f.sx + c.x, f.sy + c.y, c.w, c.h, left + c.x, top + c.y, c.w, c.h);
  }

  // Paciente sobre el robot o sobre la camilla.
  drawCarried(ctx, e, layers, rect, cx, cy) {
    const art = this.art;
    // Camilla y robot son horizontales: cabeza a la izquierda (fila "right").
    if (LYING.has(e.anim)) rect = characterFrame(art, e.anim, "right", animFrame(art, e.anim, e.animTime ?? 0));
    const bx = cx;
    const by = cy + FOOT_DY;
    const robot = this.robotAt.get(e.id);
    if (robot && robot.x === cx && robot.y === cy) {
      // El robot ya se dibujó en esta misma posición: solo va encima.
      const r = art.robot;
      this.drawRide(ctx, layers, rect, bx - r.anchor.x, by - r.anchor.y, r.ride, true);
      return;
    }
    const s = art.stretcher;
    this.drawShadow(ctx, bx, by, 1.4);
    const left = bx - s.anchor.x;
    const top = by - s.anchor.y;
    this.blit(ctx, s, spriteFrame(s, 0), left, top);
    this.drawRide(ctx, layers, rect, left, top, s.ride, true);
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
