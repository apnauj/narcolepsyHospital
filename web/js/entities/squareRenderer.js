// Renderer provisional de entidades: cuadritos de 12×12 de color por clase.
// Tiene la interfaz del contrato, { drawEntity(ctx, entity, sx, sy),
// portrait(kind, id) }, y en la ola 4 se cambia por SpriteRenderer(art).
//
// Se puede usar como instancia (new SquareRenderer()) o directamente la
// clase (SquareRenderer.drawEntity / SquareRenderer.portrait), que delega en
// una instancia compartida.

import { colorFromId } from "../ui/model.js";

/** Colores por clase de entidad (paleta Caribe del mapa). */
export const SQUARE_COLORS = Object.freeze({
  outline: "#2b2118",
  doctor: "#fdf6e3", // bata blanca
  doctorMark: "#2f80c2",
  orderly: "#3fa34d",
  other: "#8fd8c4",
  robot: "#9aa5ad",
  robotStripe: "#f7c948",
  stretcher: "#ffffff",
  stretcherFrame: "#9aa5ad",
  alert: "#d62839",
  sleep: "#2f80c2",
  eye: "#2b2118",
});

const SIZE = 12;
const HALF = SIZE / 2;
const PORTRAIT = 16;

// Glifos de 3×5 para las marcas sobre la cabeza.
const GLYPHS = {
  Z: ["111", "001", "010", "100", "111"],
  "!": ["010", "010", "010", "000", "010"],
};

function glyph(ctx, ch, x, y, color) {
  const rows = GLYPHS[ch];
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 3; c++) if (rows[r][c] === "1") ctx.fillRect(x + c, y + r, 1, 1);
  }
}

/** Color de relleno de una entidad: el de su clase, o derivado del ID si es paciente. */
export function bodyColor(kind, id) {
  if (kind === "patient") return colorFromId(id);
  return SQUARE_COLORS[kind] ?? SQUARE_COLORS.other;
}

// Marca de 2×2 en el borde hacia donde mira.
const DIR_MARK = {
  down: [-1, HALF - 3],
  up: [-1, -HALF + 1],
  left: [-HALF + 1, -1],
  right: [HALF - 3, -1],
};

export class SquareRenderer {
  constructor() {
    this.portraits = new Map();
  }

  /**
   * Dibuja la entidad centrada en (sx, sy). El contexto puede venir escalado
   * por el zoom de la cámara; todo se dibuja con fillRect para que el pixel
   * art quede nítido.
   */
  drawEntity(ctx, e, sx, sy) {
    const x = Math.round(sx - HALF);
    const y = Math.round(sy - HALF);
    const C = SQUARE_COLORS;

    // Camilla: bajo el paciente que va en ella o bajo el robot que lleva a alguien.
    if (e.anim === "stretcher" || (e.kind === "robot" && e.carrying)) {
      ctx.fillStyle = C.stretcherFrame;
      ctx.fillRect(x - 2, y + 3, SIZE + 4, 7);
      ctx.fillStyle = C.stretcher;
      ctx.fillRect(x - 1, y + 4, SIZE + 2, 5);
    }

    // Cuerpo con borde.
    ctx.fillStyle = C.outline;
    ctx.fillRect(x, y, SIZE, SIZE);
    ctx.fillStyle = bodyColor(e.kind, e.id);
    ctx.fillRect(x + 1, y + 1, SIZE - 2, SIZE - 2);
    if (e.kind === "robot") {
      ctx.fillStyle = C.robotStripe;
      ctx.fillRect(x + 1, y + 5, SIZE - 2, 2);
    } else if (e.kind === "doctor") {
      ctx.fillStyle = C.doctorMark;
      ctx.fillRect(x + 5, y + 2, 2, 4);
      ctx.fillRect(x + 4, y + 3, 4, 2);
    }

    // Hacia dónde mira (dormido no mira a ningún lado).
    if (e.anim !== "sleep" && e.anim !== "stretcher") {
      const [mx, my] = DIR_MARK[e.dir] ?? DIR_MARK.down;
      ctx.fillStyle = C.eye;
      ctx.fillRect(Math.round(sx) + mx, Math.round(sy) + my, 2, 2);
    }

    // Marcas sobre la cabeza: «!» por alerta o durante la caída, «Z» al dormir.
    const asleep = e.anim === "sleep" || e.anim === "stretcher";
    const alert = e.flags?.alert || e.anim === "attack";
    if (alert) glyph(ctx, "!", x + (asleep ? 1 : 4), y - 7, C.alert);
    if (asleep) {
      const bob = Math.floor((e.animTime ?? 0) * 2) % 2;
      glyph(ctx, "Z", x + SIZE - 3, y - 7 - bob, C.sleep);
    }
  }

  /**
   * Retrato de 16×16 para el panel de colas. Devuelve null si no hay canvas
   * disponible (p. ej. en Node).
   */
  portrait(kind, id) {
    const key = `${kind}:${id}`;
    if (this.portraits.has(key)) return this.portraits.get(key);
    const canvas = makeCanvas(PORTRAIT, PORTRAIT);
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = SQUARE_COLORS.outline;
      ctx.fillRect(0, 0, PORTRAIT, PORTRAIT);
      ctx.fillStyle = bodyColor(kind, id);
      ctx.fillRect(1, 1, PORTRAIT - 2, PORTRAIT - 2);
      ctx.fillStyle = SQUARE_COLORS.eye;
      ctx.fillRect(5, 6, 2, 2);
      ctx.fillRect(9, 6, 2, 2);
      ctx.fillRect(6, 11, 4, 1);
    }
    this.portraits.set(key, canvas);
    return canvas;
  }

  static shared() {
    SquareRenderer.instance ??= new SquareRenderer();
    return SquareRenderer.instance;
  }

  static drawEntity(ctx, e, sx, sy) {
    return SquareRenderer.shared().drawEntity(ctx, e, sx, sy);
  }

  static portrait(kind, id) {
    return SquareRenderer.shared().portrait(kind, id);
  }
}

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
