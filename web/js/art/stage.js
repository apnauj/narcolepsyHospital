// Arma el dibujo del escenario con arte, o con cuadritos y colores planos si
// el arte no carga. Lo usa buildStage (main.js) y se puede probar en Node
// inyectando `load`.

import { SquareRenderer } from "../entities/squareRenderer.js";
import { drawWorld as drawWorldWith, flatPainter } from "../world/render.js";
import { getArt, loadArt } from "./sheets.js";
import { SpriteRenderer } from "./spriteRenderer.js";
import { tilePainter } from "./tilePainter.js";

let artPromise = null;

/**
 * Carga el arte una sola vez (cacheado). Si falla, avisa con console.warn,
 * recuerda el fallo y devuelve null para no reintentar en cada partida.
 */
export function ensureArt({ load = loadArt, warn = console.warn } = {}) {
  artPromise ??= Promise.resolve(getArt() ?? load()).catch((err) => {
    warn("no se pudo cargar el arte; se usan cuadritos de colores:", err);
    return null;
  });
  return artPromise;
}

/** Para los tests: olvida el arte cacheado. */
export function resetArtCache() {
  artPromise = null;
}

/**
 * @returns {Promise<{renderer, drawWorld: Function, painter: Function|null, art: object|null}>}
 *   drawWorld es de 3 argumentos (ctx, world, camera), como espera la escena.
 *   Con arte, además engancha `director.draw` para pintar tras las entidades
 *   el segundo pase de decoración alta (painter.drawOverlay).
 */
export async function createStageArt(world, director, opts = {}) {
  const art = await ensureArt(opts);
  if (!art) {
    return {
      renderer: new SquareRenderer(),
      drawWorld: (ctx, w, cam) => drawWorldWith(ctx, w, cam, flatPainter),
      painter: null,
      art: null,
    };
  }
  const painter = tilePainter(art, world);
  if (director) {
    const drawEntities = director.draw.bind(director);
    director.draw = (ctx, cam, r) => {
      drawEntities(ctx, cam, r);
      painter.drawOverlay(ctx, world, cam);
    };
  }
  return {
    renderer: new SpriteRenderer(art, { world }),
    drawWorld: (ctx, w, cam) => drawWorldWith(ctx, w, cam, painter),
    painter,
    art,
  };
}
