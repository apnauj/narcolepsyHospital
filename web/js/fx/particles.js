// Partículas de los efectos: «Zzz», «!», notas del picó y chispitas.
//
// Una partícula vive `life` segundos. Las libres se mueven en coordenadas de
// mundo con velocidad y aceleración; las ancladas (`anchor` = ID de entidad)
// siguen a su entidad y se dibujan con un desplazamiento que depende de la
// edad (el «!» que salta sobre la cabeza). El sistema es puro: no dibuja.

/** Tope de partículas vivas; al pasarse se descartan las más viejas. */
export const MAX_PARTICLES = 160;

export class Particles {
  constructor(max = MAX_PARTICLES) {
    this.max = max;
    /** @type {Array<object>} */
    this.list = [];
  }

  /**
   * Crea una partícula. Campos: kind, x, y, vx, vy, ax, ay, life, color,
   * anchor (ID de entidad o null), dx/dy (desplazamiento si está anclada),
   * wobble (amplitud del vaivén horizontal en px) y phase.
   */
  emit(p) {
    const q = {
      kind: "spark",
      x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
      life: 1, age: 0,
      color: "#ffffff",
      anchor: null, dx: 0, dy: 0,
      wobble: 0, phase: 0,
      ...p,
    };
    this.list.push(q);
    if (this.list.length > this.max) this.list.splice(0, this.list.length - this.max);
    return q;
  }

  /** Avanza dt segundos y descarta las que cumplieron su vida. */
  update(dt) {
    if (!(dt > 0)) return;
    for (const p of this.list) {
      p.age += dt;
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  /** Quita las ancladas a entidades que ya no existen. */
  dropOrphans(exists) {
    this.list = this.list.filter((p) => !p.anchor || exists(p.anchor));
  }

  /** Cuántas hay de una clase (o en total). */
  count(kind) {
    return kind ? this.list.filter((p) => p.kind === kind).length : this.list.length;
  }

  clear() {
    this.list = [];
  }

  get size() {
    return this.list.length;
  }
}

/** Vaivén horizontal de una partícula libre, en px. */
export function wobbleX(p) {
  return p.wobble ? Math.sin(p.phase + p.age * 4) * p.wobble : 0;
}

/**
 * Altura del salto del «!» (px hacia arriba) según la edad: un salto alto y
 * dos rebotes que se apagan, en `dur` segundos.
 */
export function bounceHeight(age, dur = 0.7) {
  if (age < 0 || age >= dur) return 0;
  const hops = [
    { t: 0.5, h: 7 },
    { t: 0.3, h: 3 },
    { t: 0.2, h: 1 },
  ];
  let t = age / dur;
  for (const hop of hops) {
    if (t < hop.t) {
      const u = t / hop.t; // 0..1 dentro del salto
      return Math.round(4 * hop.h * u * (1 - u));
    }
    t -= hop.t;
  }
  return 0;
}

/** Tamaño de la «z» según la fracción de vida: crece de z1 a z3. */
export function zGlyphFor(p) {
  const f = p.age / p.life;
  if (f < 0.3) return "z1";
  if (f < 0.65) return "z2";
  return "z3";
}

/** true si la partícula está en el último tramo de su vida (parpadea al apagarse). */
export function fading(p, tail = 0.25) {
  return p.age > p.life * (1 - tail);
}
