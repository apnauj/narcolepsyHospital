// Búsqueda de caminos A* sobre la grilla del mundo.
//
// 4 vecinos, costo 1 por paso y heurística Manhattan (admisible y consistente).
// El desempate es estable: a igual f gana el menor h y, después, el que entró
// primero a la cola; los vecinos se expanden siempre en el mismo orden
// (arriba, derecha, abajo, izquierda). Así el mismo pedido da el mismo camino.

// Vecinos en orden fijo: arriba, derecha, abajo, izquierda.
const NEIGHBORS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Cola de prioridad binaria (mínimo arriba) con entradas [f, h, seq, idx]. */
class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  static less(p, q) {
    if (p[0] !== q[0]) return p[0] < q[0];
    if (p[1] !== q[1]) return p[1] < q[1];
    return p[2] < q[2];
  }

  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!MinHeap.less(a[i], a[parent])) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && MinHeap.less(a[l], a[m])) m = l;
        if (r < a.length && MinHeap.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Camino más corto de `from` a `to` (ambos incluidos) o null si no hay.
 *
 * - El tile de partida no se valida: un paciente acostado en una cama puede
 *   levantarse y salir caminando.
 * - El destino debe ser caminable.
 * - `occupied` (Set de "tx,ty") se trata como obstáculo, salvo el destino y
 *   la partida.
 *
 * @param {World} world
 * @param {{tx:number, ty:number}} from
 * @param {{tx:number, ty:number}} to
 * @param {{occupied?: Set<string>}} [options]
 * @returns {{tx:number, ty:number}[] | null}
 */
export function findPath(world, from, to, { occupied } = {}) {
  const { cols, rows } = world;
  const inside = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  if (!inside(from.tx, from.ty) || !inside(to.tx, to.ty)) return null;
  if (!world.walkable(to.tx, to.ty)) return null;

  const start = from.ty * cols + from.tx;
  const goal = to.ty * cols + to.tx;
  if (start === goal) return [{ tx: from.tx, ty: from.ty }];

  const n = cols * rows;
  const g = new Int32Array(n).fill(-1);       // -1 = sin visitar
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heuristic = (x, y) => Math.abs(x - to.tx) + Math.abs(y - to.ty);

  const open = new MinHeap();
  let seq = 0;
  g[start] = 0;
  open.push([heuristic(from.tx, from.ty), heuristic(from.tx, from.ty), seq++, start]);

  while (open.size > 0) {
    const [, , , cur] = open.pop();
    if (closed[cur]) continue; // entrada vieja de un nodo ya cerrado
    if (cur === goal) return rebuild(came, goal, cols);
    closed[cur] = 1;

    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    for (const [ox, oy] of NEIGHBORS) {
      const nx = cx + ox;
      const ny = cy + oy;
      if (!inside(nx, ny)) continue;
      const next = ny * cols + nx;
      if (closed[next] || !world.walkable(nx, ny)) continue;
      if (next !== goal && occupied?.has(`${nx},${ny}`)) continue;
      const cost = g[cur] + 1;
      if (g[next] !== -1 && cost >= g[next]) continue;
      g[next] = cost;
      came[next] = cur;
      const h = heuristic(nx, ny);
      open.push([cost + h, h, seq++, next]);
    }
  }
  return null;
}

function rebuild(came, goal, cols) {
  const path = [];
  for (let i = goal; i !== -1; i = came[i]) {
    path.push({ tx: i % cols, ty: Math.floor(i / cols) });
  }
  return path.reverse();
}
