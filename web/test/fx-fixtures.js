// Apoyo para los tests fx-*: contexto 2D falso, director falso y una
// cámara mínima.

import { Bubble } from "../js/ui/bubble.js";

/** Contexto 2D falso que registra las llamadas. measureText: 5 px por letra. */
export function fakeCtx({ width = 384, height = 216 } = {}) {
  const calls = [];
  const target = {
    calls,
    canvas: { width, height },
    measureText: (t) => ({ width: [...String(t)].length * 5 }),
  };
  return new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      return (...args) => calls.push([key, ...args]);
    },
    set(obj, key, value) {
      obj[key] = value;
      calls.push([`set:${String(key)}`, value]);
      return true;
    },
  });
}

/** Llamadas de un tipo (p. ej. "fillRect"). */
export const callsOf = (ctx, name) => ctx.calls.filter((c) => c[0] === name);

/** Cámara mínima con la interfaz de world/camera.js a zoom 1 y sin desplazar. */
export function flatCamera({ viewW = 384, viewH = 216, x = 0, y = 0, zoom = 1 } = {}) {
  return {
    viewW, viewH, zoom,
    offsetX: Math.round(x * zoom),
    offsetY: Math.round(y * zoom),
    visibleW: viewW / zoom,
    visibleH: viewH / zoom,
    toScreen(wx, wy) {
      return { x: wx * zoom - this.offsetX, y: wy * zoom - this.offsetY };
    },
  };
}

/** Entidad de prueba con los campos del contrato. */
export function ent(kind, id, x, y, extra = {}) {
  return { kind, id, x, y, dir: "down", anim: "idle", animTime: 0, flags: { alert: false }, ...extra };
}

/** Director falso: entities, entity(id), say(e, text), bubbles y bedOf. */
export class FakeDirector {
  constructor(entities = []) {
    this.list = entities;
    this.bubbles = [];
    this.said = [];
    this.beds = new Map();
  }
  get entities() {
    return this.list;
  }
  entity(id) {
    return this.list.find((e) => e.id === id) ?? null;
  }
  say(e, text) {
    this.said.push({ id: e.id, text });
    this.bubbles = this.bubbles.filter((b) => b.id !== e.id);
    this.bubbles.push({ id: e.id, bubble: new Bubble(text, 0, 0) });
  }
  bedOf(id) {
    return this.beds.get(id) ?? 0;
  }
  update(dt) {
    for (const b of this.bubbles) b.bubble.update(dt);
    this.bubbles = this.bubbles.filter((b) => !b.bubble.done);
  }
}

/** rng que devuelve los valores dados en ciclo. */
export function cycleRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** Avanza director y efectos juntos en pasos fijos. */
export function step(director, fx, { seconds = 1, dt = 1 / 30, until = null } = {}) {
  let t = 0;
  while (t < seconds) {
    director.update(dt);
    fx.update(dt, director);
    t += dt;
    if (until && until()) return t;
  }
  return t;
}
