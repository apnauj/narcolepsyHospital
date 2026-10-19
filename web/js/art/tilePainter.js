// Painter del mapa con sprites: misma firma que flatPainter
// (painter(ctx, tile, x, y, tx, ty)) más los ganchos decor, zoneBorder y
// drawOverlay. Todo sale del manifest (tiles.byType, objetos con origin).
//
// Uso: const painter = tilePainter(art, world);
//      drawWorld(ctx, world, camera, painter);   // suelo, muebles, muros
//      director.draw(...);                       // personajes
//      painter.drawOverlay(ctx, world, camera);  // copas de palmeras, ventiladores...
//
// `world` es opcional pero hace falta para dos detalles: el muro con cara o
// con tope según el tile de abajo, y la sombra del muro sobre el piso.

import { TILE, isWallLike } from "../world/tiles.js";
import { visibleTiles, flatPainter } from "../world/render.js";
import { objectFor, spriteFrame, tileFor } from "./sheets.js";

const S = 16;
const TILE_NAMES = Object.fromEntries(Object.entries(TILE).map(([name, v]) => [v, name]));
const FLOORS = new Set([TILE.FLOOR, TILE.ROOM_FLOOR, TILE.WOOD]);
const WALL_SHADOW = 3; // px de sombra que cae del muro sobre el piso
const WALL_SHADOW_ALPHA = 0.18;

// Dígitos 3×5 para el número de las puertas (la plaquita viene vacía).
const DIGITS = [
  "111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001",
  "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111",
];

/**
 * @param {Art} art
 * @param {World} [world]
 * @returns {Function} painter con .decor, .zoneBorder, .drawOverlay y .setWorld
 */
export function tilePainter(art, world = null) {
  let w = world;
  // Decoración que se repinta encima de los personajes, por mundo.
  const overlays = new WeakMap();

  const tileAt = (tx, ty) => (w && tx >= 0 && ty >= 0 && tx < w.cols && ty < w.rows ? w.tiles[ty * w.cols + tx] : -1);

  function blitTile(ctx, name, x, y) {
    const t = tileFor(art, name);
    if (!t || !t.image) return false;
    const f = t.frames > 1 && painter.time ? Math.floor(painter.time * t.fps) % t.frames : 0;
    ctx.drawImage(t.image, t.x + f * t.size, t.y, t.size, t.size, x, y, S, S);
    return true;
  }

  function painter(ctx, tile, x, y, tx, ty) {
    const type = TILE_NAMES[tile];
    let name = art.tiles.byType[type];
    if (tile === TILE.WALL) {
      // Con perspectiva 3/4: se ve la cara si debajo hay piso; si no, el tope.
      name = isWallLike(tileAt(tx, ty + 1)) ? "pared-tope" : "pared";
    }
    if (!name || !blitTile(ctx, name, x, y)) {
      flatPainter(ctx, tile, x, y, tx, ty); // sin arte para este tile
      return;
    }
    // Sombra suave del muro sobre el piso que tiene justo debajo.
    if (FLOORS.has(tile) && tileAt(tx, ty - 1) === TILE.WALL) {
      ctx.save();
      ctx.globalAlpha = WALL_SHADOW_ALPHA;
      ctx.fillStyle = "#2b2118";
      ctx.fillRect(x, y, S, WALL_SHADOW);
      ctx.restore();
    }
  }

  // Dibuja un sprite de decoración con su origin; `repeat` lo copia por tile.
  function blitObject(ctx, d, sprite, x, y, rows) {
    if (!sprite.image) return;
    const dw = d.w ?? 1;
    const dh = d.h ?? 1;
    const f = spriteFrame(sprite, 0); // las animadas quedan en el frame 0
    const sy = rows ? f.sy + rows.from : f.sy;
    const sh = rows ? rows.to - rows.from : f.sh;
    const dyOff = rows ? rows.from : 0;
    if (sprite.tags?.includes("repeat")) {
      for (let j = 0; j < dh; j++) {
        for (let i = 0; i < dw; i++) ctx.drawImage(sprite.image, f.sx, f.sy, f.sw, f.sh, x + i * S, y + j * S, f.sw, f.sh);
      }
      return;
    }
    let ox;
    let oy;
    if (sprite.origin) {
      ox = x - sprite.origin.x;
      oy = y - sprite.origin.y;
    } else {
      ox = x + Math.floor((dw * S - f.sw) / 2);
      oy = y + dh * S - f.sh;
    }
    ctx.drawImage(sprite.image, f.sx, sy, f.sw, sh, ox, oy + dyOff, f.sw, sh);
  }

  painter.setWorld = (nw) => {
    w = nw;
  };
  /** Segundos, para los tiles animados (mar). Sin fijar, quedan en el frame 0. */
  painter.time = 0;

  painter.decor = function decor(ctx, d, x, y) {
    // Primero el piso que el mueble tapa.
    if (d.under !== undefined) {
      for (let j = 0; j < (d.h ?? 1); j++) {
        for (let i = 0; i < (d.w ?? 1); i++) painter(ctx, d.under, x + i * S, y + j * S, d.tx + i, d.ty + j);
      }
    }
    const sprite = objectFor(art, d);
    if (!sprite) return;
    // Lo de techo (ventilador: solo su eje) va en drawOverlay.
    if (sprite.tags?.includes("ceiling")) return;
    blitObject(ctx, d, sprite, x, y);
    if (d.kind === "doorNumber" && d.label) drawNumber(ctx, d.label, x, y, sprite);
  };

  function drawNumber(ctx, text, x, y, sprite) {
    const total = text.length * 4 - 1;
    // Centrado en la plaquita (su origin es negativo: cae dentro del tile).
    let cx = x - (sprite.origin?.x ?? 0) + Math.floor((sprite.frame.w - total) / 2);
    const cy = y - (sprite.origin?.y ?? 0) + Math.floor((sprite.frame.h - 5) / 2);
    ctx.fillStyle = "#2b2118";
    for (const ch of text) {
      const bits = DIGITS[ch.charCodeAt(0) - 48];
      if (bits) {
        for (let i = 0; i < 15; i++) if (bits[i] === "1") ctx.fillRect(cx + (i % 3), cy + Math.floor(i / 3), 1, 1);
      }
      cx += 4;
    }
  }

  // Del ventilador solo el eje (el centro 6×6 del frame 0): las aspas que
  // giran las pinta web/js/fx encima.
  function drawHub(ctx, sprite, x, y) {
    if (!sprite.image) return;
    const f = spriteFrame(sprite, 0);
    const c = Math.floor((f.sw - 6) / 2);
    ctx.drawImage(sprite.image, f.sx + c, f.sy + c, 6, 6, x + c, y + c, 6, 6);
  }

  painter.zoneBorder = flatPainter.zoneBorder;

  /**
   * Segundo pase, después de dibujar las entidades: repinta lo que debe
   * quedar sobre los personajes que pasan por detrás (la parte de un mueble
   * alto que sobresale por encima de su huella: copas de palmeras, letrero
   * de la entrada) y el eje de los ventiladores. El contexto es el de
   * pantalla, como el de drawWorld; este método aplica la cámara.
   */
  painter.drawOverlay = function drawOverlay(ctx, world2, camera) {
    const wd = world2 ?? w;
    if (!wd) return;
    let list = overlays.get(wd);
    if (!list) {
      list = [];
      for (const d of wd.decor) {
        const sprite = objectFor(art, d);
        if (!sprite) continue;
        if (sprite.tags?.includes("ceiling")) list.push({ d, sprite, ceiling: true });
        // Las camas (tienen `mattress`) no se repintan: taparían al paciente.
        else if (sprite.tags?.includes("floor") && sprite.origin?.y > 0 && !sprite.mattress) list.push({ d, sprite, ceiling: false });
      }
      overlays.set(wd, list);
    }
    if (!list.length) return;
    const view = visibleTiles(wd, camera);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(-camera.offsetX, -camera.offsetY);
    ctx.scale(camera.zoom, camera.zoom);
    for (const { d, sprite, ceiling } of list) {
      const dw = d.w ?? 1;
      const dh = d.h ?? 1;
      if (d.tx + dw + 4 < view.tx0 || d.tx - 4 > view.tx1 || d.ty + dh + 3 < view.ty0 || d.ty - 3 > view.ty1) continue;
      const x = d.tx * S;
      const y = d.ty * S;
      if (ceiling) drawHub(ctx, sprite, x, y);
      else blitObject(ctx, d, sprite, x, y, { from: 0, to: sprite.origin.y });
    }
    ctx.restore();
  };

  return painter;
}
