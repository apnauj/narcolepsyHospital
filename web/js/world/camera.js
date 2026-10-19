// Cámara 2D del mapa y sus controles de teclado y mouse.
//
// Coordenadas:
//   - mundo: píxeles del mapa (tile × 16).
//   - pantalla: píxeles del canvas interno (384×216), antes del escalado CSS.
// (x, y) es la esquina superior izquierda visible, en píxeles de mundo. La
// posición se guarda sin redondear; para dibujar se usa `offsetX/offsetY`, que
// redondea en píxeles de pantalla para que el pixel art no tiemble.

/** Velocidad del paneo con teclado, en píxeles de pantalla por segundo. */
const KEY_SPEED = 180;

const KEY_DIRS = {
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1],
};

export class Camera {
  /**
   * @param {number} viewW ancho del canvas en px de pantalla
   * @param {number} viewH alto del canvas en px de pantalla
   * @param {number} worldW ancho del mundo en px de mundo
   * @param {number} worldH alto del mundo en px de mundo
   */
  constructor(viewW, viewH, worldW, worldH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.worldW = worldW;
    this.worldH = worldH;
    this.x = 0;
    this.y = 0;
    /** @type {1|2} */
    this.zoom = 1;
    this.clamp();
  }

  /** Ancho visible en píxeles de mundo. */
  get visibleW() {
    return this.viewW / this.zoom;
  }

  /** Alto visible en píxeles de mundo. */
  get visibleH() {
    return this.viewH / this.zoom;
  }

  /** Desplazamiento entero en px de pantalla que usa el dibujo. */
  get offsetX() {
    return Math.round(this.x * this.zoom);
  }

  get offsetY() {
    return Math.round(this.y * this.zoom);
  }

  /** Cambia el tamaño del mundo (al regenerar el mapa) y vuelve a limitar. */
  setWorldSize(worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.clamp();
  }

  /** Fija el zoom (1 o 2) manteniendo el centro de la vista. */
  setZoom(zoom) {
    const cx = this.x + this.visibleW / 2;
    const cy = this.y + this.visibleH / 2;
    this.zoom = zoom === 2 ? 2 : 1;
    this.centerOn(cx, cy);
  }

  toggleZoom() {
    this.setZoom(this.zoom === 1 ? 2 : 1);
  }

  /** Mueve la vista en píxeles de mundo. */
  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  /** Centra la vista en un punto del mundo. */
  centerOn(wx, wy) {
    this.x = wx - this.visibleW / 2;
    this.y = wy - this.visibleH / 2;
    this.clamp();
  }

  /** Pantalla (px del canvas) -> mundo. */
  toWorld(sx, sy) {
    return { x: (sx + this.offsetX) / this.zoom, y: (sy + this.offsetY) / this.zoom };
  }

  /** Mundo -> pantalla (px del canvas). */
  toScreen(wx, wy) {
    return { x: wx * this.zoom - this.offsetX, y: wy * this.zoom - this.offsetY };
  }

  /**
   * Mantiene la vista dentro del mundo. Si el mundo es más chico que la vista
   * en un eje, lo centra (x o y quedan negativos).
   */
  clamp() {
    this.x = clampAxis(this.x, this.worldW, this.visibleW);
    this.y = clampAxis(this.y, this.worldH, this.visibleH);
  }
}

function clampAxis(pos, world, visible) {
  if (world <= visible) return (world - visible) / 2;
  return Math.min(Math.max(pos, 0), world - visible);
}

function isTypingTarget(el) {
  if (!el || typeof el !== "object") return false;
  const tag = (el.tagName ?? "").toLowerCase();
  return tag === "input" || tag === "select" || tag === "textarea" || el.isContentEditable === true;
}

/**
 * Conecta flechas/WASD (paneo), Z (zoom ×1/×2) y arrastre con el mouse.
 * Las teclas se ignoran mientras se escribe en un campo de formulario.
 *
 * @param {Camera} camera
 * @param {HTMLCanvasElement} canvas
 * @param {{ keyTarget?: EventTarget, zoomKey?: string }} [options]
 * @returns {{ detach(): void, wasDrag(): boolean }} `wasDrag` dice si el último
 *   clic fue en realidad un arrastre (para que un clic de selección lo ignore).
 */
export function attachCameraControls(camera, canvas, { keyTarget = globalThis.window, zoomKey = "z" } = {}) {
  const held = new Set();
  let rafId = 0;
  let last = 0;

  const step = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    let vx = 0, vy = 0;
    for (const k of held) {
      vx += KEY_DIRS[k][0];
      vy += KEY_DIRS[k][1];
    }
    const speed = (KEY_SPEED * dt) / camera.zoom;
    camera.pan(Math.sign(vx) * speed, Math.sign(vy) * speed);
    rafId = held.size > 0 ? requestAnimationFrame(step) : 0;
  };

  const onKeyDown = (e) => {
    if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === zoomKey) {
      camera.toggleZoom();
      e.preventDefault();
      return;
    }
    if (!KEY_DIRS[k]) return;
    e.preventDefault();
    held.add(k);
    if (!rafId) {
      last = performance.now();
      rafId = requestAnimationFrame(step);
    }
  };

  const onKeyUp = (e) => held.delete(e.key.toLowerCase());
  const onBlur = () => held.clear();

  // Arrastre: los px del cliente se pasan a px del canvas por el escalado CSS.
  let drag = null;
  let dragged = false;
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    dragged = false;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const box = canvas.getBoundingClientRect();
    const scale = box.width > 0 ? canvas.width / box.width : 1;
    const dx = (e.clientX - drag.x) * scale;
    const dy = (e.clientY - drag.y) * scale;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 3) dragged = true;
    camera.pan(-dx / camera.zoom, -dy / camera.zoom);
  };
  const onPointerUp = (e) => {
    if (drag && e.pointerId === drag.id) drag = null;
  };

  keyTarget?.addEventListener("keydown", onKeyDown);
  keyTarget?.addEventListener("keyup", onKeyUp);
  keyTarget?.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  return {
    detach() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      held.clear();
      keyTarget?.removeEventListener("keydown", onKeyDown);
      keyTarget?.removeEventListener("keyup", onKeyUp);
      keyTarget?.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    },
    wasDrag: () => dragged,
  };
}
