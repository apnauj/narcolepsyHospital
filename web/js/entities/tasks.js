// Tareas componibles que una entidad ejecuta en secuencia.
//
// Una tarea es un objeto { name, start?(e, d), update?(e, d, dt) -> bool,
// cancel?(e, d) }: `start` corre la primera vez, `update` devuelve true
// cuando terminó y `cancel` se llama si otra secuencia la reemplaza. Cada
// llamada a una fábrica (walkTo, wait...) crea una tarea nueva: no se
// reutilizan entre entidades.
//
// `d` es el director, que ofrece a las tareas:
//   d.world, d.rng
//   d.reserve(e, tile)          reserva el tile destino (lo evitan los demás)
//   d.planPath(e, goal)         A* evitando los tiles reservados por otros
//   d.isBlocked(e, tile)        hay alguien quieto en ese tile
//   d.pickUp(carrier, pid)      sube al paciente a la camilla
//   d.dropInBed(carrier, pid, room)
//   d.bedIsFree(room, pid), d.roomSpots(room)
//   d.randomPoiTile(e), d.randomPatrolTile(e), d.homeTile(robot)

import { moveAlong, sameTile, tileCenter } from "./entity.js";

/** Re-planificaciones por bloqueo antes de pasar «a través» de quien estorba. */
const MAX_REPLANS = 6;

// ---------------------------------------------------------------------------
// Ejecución.

/** Reemplaza la secuencia de la entidad (cancela la tarea en curso). */
export function setTasks(e, d, tasks) {
  e.task?.cancel?.(e, d);
  e.task = null;
  e.tasks = [...tasks];
}

/** Agrega tareas al final de la secuencia. */
export function addTasks(e, tasks) {
  e.tasks.push(...tasks);
}

/** true si la entidad no tiene nada que hacer. */
export function isIdle(e) {
  return !e.task && e.tasks.length === 0;
}

/**
 * Avanza la secuencia de la entidad. Las tareas instantáneas (call...) se
 * encadenan en el mismo cuadro; una tarea puede reemplazar la secuencia
 * (setTasks) desde su propio update sin romper el recorrido.
 */
export function runTasks(e, d, dt) {
  for (let guard = 0; guard < 32; guard++) {
    if (!e.task) {
      e.task = e.tasks.shift() ?? null;
      if (!e.task) return;
    }
    const t = e.task;
    if (!t.started) {
      t.started = true;
      t.start?.(e, d);
      if (e.task !== t) continue;
    }
    const done = t.update ? t.update(e, d, dt) : true;
    if (e.task !== t) continue; // la tarea cambió la secuencia
    if (!done) return;
    e.task = null;
    if (t.update) dt = 0; // si gastó tiempo, lo que sigue espera al próximo cuadro
  }
}

// ---------------------------------------------------------------------------
// Tareas básicas.

/**
 * Camina hasta un tile con A*. `target` es un tile o una función (e, d) ->
 * tile que se evalúa al empezar. Reserva el destino para que nadie más lo
 * elija. Si el siguiente tile queda ocupado por alguien quieto, re-planifica;
 * si no hay otro camino, pasa igual (nunca se traba). Si no hay camino
 * posible, aparece en el destino.
 */
export function walkTo(target, { anim = "walk", reserve = true } = {}) {
  let goal = null;
  let replans = 0;
  const walk = { path: [], checked: false };
  const canEnter = (e, d) => (next) =>
    sameTile(next, goal) || replans >= MAX_REPLANS || !d.isBlocked(e, next);

  return {
    name: "walkTo",
    start(e, d) {
      goal = typeof target === "function" ? target(e, d) : target;
      if (!goal) return;
      if (reserve) d.reserve(e, goal);
      const path = d.planPath(e, goal);
      if (!path) {
        e.placeAt(goal);
        walk.path = [];
      } else {
        if (e.atTileCenter() && sameTile(path[0], e.tile)) path.shift();
        walk.path = path;
      }
      e.moving = walk.path.length > 0;
      if (e.moving) e.setAnim(anim);
    },
    update(e, d, dt) {
      if (!goal) return true;
      const res = moveAlong(e, walk, e.speed * dt, canEnter(e, d));
      if (res.blocked) {
        replans++;
        const path = d.planPath(e, goal);
        if (path && path.length > 1 && !sameTile(path[1], walk.path[0])) {
          path.shift();
          walk.path = path;
          walk.checked = false;
        } else {
          walk.checked = true; // no hay alternativa: pasa
        }
        return false;
      }
      if (!res.arrived) return false;
      e.moving = false;
      if (e.anim === anim) e.setAnim("idle");
      return true;
    },
    cancel(e) {
      e.moving = false;
    },
  };
}

/** Espera `seconds` con una animación opcional. */
export function wait(seconds, anim) {
  let t = 0;
  return {
    name: "wait",
    start(e) {
      if (anim) e.setAnim(anim);
    },
    update(_e, _d, dt) {
      t += dt;
      return t >= seconds;
    },
  };
}

/** Espera hasta que `pred(e, d)` sea true, o hasta `timeout` segundos. */
export function waitUntil(pred, { timeout = Infinity, anim } = {}) {
  let t = 0;
  return {
    name: "waitUntil",
    start(e) {
      if (anim) e.setAnim(anim);
    },
    update(e, d, dt) {
      t += dt;
      return t >= timeout || Boolean(pred(e, d));
    },
  };
}

/** Acción instantánea. */
export function call(fn, name = "call") {
  return { name, start: (e, d) => fn(e, d) };
}

/** Se queda así hasta que otra secuencia la reemplace (dormir, atender, cargar). */
export function hold(anim) {
  return {
    name: "hold",
    start(e) {
      if (anim) e.setAnim(anim);
    },
    update: () => false,
  };
}

/** Mira hacia un punto o entidad que devuelve `fn(e, d)`. */
export function faceTo(fn) {
  return call((e, d) => {
    const p = fn(e, d);
    if (p) e.face(p.x, p.y);
  }, "faceTo");
}

/** Fija el estado de la máquina visual. */
export function setState(state) {
  return call((e) => {
    e.state = state;
  }, "setState");
}

// ---------------------------------------------------------------------------
// Tareas compuestas.

/** Recoge al paciente: camina hasta su tile y lo sube a la camilla. */
export function pickUp(patientId) {
  return [
    walkTo((_e, d) => d.entity(patientId)?.tile ?? null),
    call((e, d) => d.pickUp(e, patientId), "pickUp"),
  ];
}

/**
 * Transporta al paciente que lleva hasta su cama: camina al tile de descarga
 * (empujando si es camillero), espera a que la cama quede libre (máx. 6 s)
 * y lo acuesta.
 */
export function transportToBed(patientId, room, { anim = "walk" } = {}) {
  return [
    walkTo((_e, d) => d.roomSpots(room)?.drop ?? null, { anim }),
    waitUntil((_e, d) => d.bedIsFree(room, patientId), { timeout: 6 }),
    call((e, d) => d.dropInBed(e, patientId, room), "dropInBed"),
  ];
}

/**
 * Atiende: camina hasta `spot` (función que da el tile), mira al paciente y
 * se queda con la animación `attend`.
 */
export function attend(patientId, spot) {
  return [
    walkTo(spot),
    faceTo((_e, d) => d.entity(patientId)),
    setState("Atendiendo"),
    hold("attend"),
  ];
}

/** Robot: vuelve a su puesto de carga y queda en base. */
export function returnToBase(onDocked) {
  return [
    setState("RegresandoABase"),
    walkTo((e, d) => d.homeTile(e)),
    call((e, d) => {
      e.dir = "down";
      e.state = "EnBase";
      onDocked?.(e, d);
    }, "docked"),
    hold("idle"),
  ];
}

/** Paciente despierto: camina a un poi libre al azar y se queda un rato. */
export function wanderToPoi() {
  return [
    setState("Caminando"),
    walkTo((e, d) => d.randomPoiTile(e)),
    {
      name: "linger",
      start(e, d) {
        this.left = 2 + d.rng() * 4;
        e.setAnim("idle");
      },
      update(_e, _d, dt) {
        this.left -= dt;
        return this.left <= 0;
      },
    },
  ];
}

/** Personal libre: camina a un tile de pasillo al azar y mira alrededor. */
export function patrol() {
  return [
    setState("Patrullando"),
    walkTo((e, d) => d.randomPatrolTile(e)),
    {
      name: "lookAround",
      start(e, d) {
        this.left = 1 + d.rng() * 2;
        e.setAnim("idle");
      },
      update(_e, _d, dt) {
        this.left -= dt;
        return this.left <= 0;
      },
    },
  ];
}

/** Punto de mundo del centro de un tile (atajo para faceTo). */
export function centerOf(tile) {
  return tile ? tileCenter(tile) : null;
}
