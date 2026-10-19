// Tests del Director (web/js/entities/director.js): los 4 casos del
// contrato, el paso 6 del escenario, camillas insuficientes, eventos
// encadenados, convergencia al snapshot, locationOf, pick y determinismo.
// Se simula update(dt) en pasos fijos hasta un tope de tiempo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { generateWorld, roomAt, zoneAt } from "../js/world/index.js";
import { Director } from "../js/entities/index.js";
import { manhattan, sameTile } from "../js/entities/entity.js";
import {
  FakeHospital, LOC, SCENARIO_STEPS, scenarioHospital, seededRng, simulate,
} from "./entities-fixtures.js";

// Nombres válidos de hospital.Location, leídos del código Go.
const GO_LOCATIONS = (() => {
  const src = readFileSync(new URL("../../hospital/location.go", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("names := [...]string{"));
  return new Set([...block.slice(0, block.indexOf("}")).matchAll(/"([^"]+)"/g)].map((m) => m[1]));
})();

const WORLD3 = generateWorld({ rooms: 3 });
const MAX_T = 180; // tope de tiempo simulado por espera

const doctor = (id) => ({ id, name: id, kind: "doctor" });
const orderly = (id) => ({ id, name: id, kind: "orderly" });
const patients = (n) => Array.from({ length: n }, (_, i) => ({ id: `P-00${i + 1}`, name: `Paciente ${i + 1}` }));

/** Hospital falso + director sincronizados y con unos segundos de paseo. */
function setup({ rooms = [101, 102, 103], staff = [doctor("D-01")], n = 2, robots = 2, seed = 7, world = WORLD3 } = {}) {
  const h = new FakeHospital({ rooms, staff, patients: patients(n) });
  const d = new Director(world, { robots, rng: seededRng(seed) });
  d.sync(h.snapshot());
  simulate(d, { seconds: 3 });
  const send = (result) => {
    d.apply(result.events, result.snapshot);
    return result;
  };
  return { h, d, world, send };
}

/** Simula hasta que todo quedó quieto: sin trabajos, robots en base y personal llegado. */
function settle(d, robots, extra = () => true) {
  const t = simulate(d, {
    seconds: MAX_T,
    until: () => d.settled && d.robotsFree() === robots && staffArrived(d) && extra(),
  });
  assert.ok(t < MAX_T, "la animación no terminó dentro del tope");
  return t;
}

function staffArrived(d) {
  return d.entities.every((e) => e.kind === "patient" || e.kind === "robot" || !e.assignment || e.state === "Atendiendo");
}

const roomOf = (world, n) => world.rooms.find((r) => r.number === n);

function assertInBed(d, world, pid, room) {
  const p = d.entity(pid);
  assert.equal(d.bedOf(pid), room, `${pid} en la cama ${room}`);
  assert.ok(sameTile(p.tile, roomOf(world, room).bed), `${pid} sobre la cama`);
  assert.equal(p.anim, "sleep");
}

function assertAtBedside(d, world, sid, room) {
  const s = d.entity(sid);
  assert.ok(sameTile(s.tile, roomOf(world, room).bedside), `${sid} al bedside de ${room}`);
  assert.equal(s.anim, "attend");
  assert.equal(d.visualStatus(sid), "atendiendo");
}

function assertRobotsHome(d, world) {
  for (const r of d.robots) {
    assert.equal(d.visualStatus(r.id), "en base");
    assert.ok(sameTile(r.tile, world.robotBase[r.slot]), `${r.id} en su puesto`);
    assert.equal(r.carrying, undefined);
  }
}

/** Vigila valores durante la simulación (mínimo de robots libres, quién cargó a quién). */
function watch(d, fn) {
  const original = d.update.bind(d);
  d.update = (dt) => {
    original(dt);
    fn();
  };
}

test("caso 1 con doctor: camilla robot a la cama, el doctor al bedside y el robot vuelve", () => {
  const { d, h, world, send } = setup({ staff: [doctor("D-01")], n: 1 });
  let minFree = 2;
  let carriedByRobot = false;
  watch(d, () => {
    minFree = Math.min(minFree, d.robotsFree());
    if (d.entity("P-001").carriedBy?.startsWith("R-")) carriedByRobot = true;
  });
  const r = send(h.attack("P-001"));
  assert.deepEqual(r.events.map((e) => e.type), ["attackStarted", "roomAssigned", "attentionAssigned"]);
  assert.equal(d.visualStatus("P-001"), "atacado");
  assert.equal(d.entity("P-001").anim, "attack");
  settle(d, 2);
  assert.equal(minFree, 1, "salió una camilla");
  assert.ok(carriedByRobot);
  assertInBed(d, world, "P-001", 101);
  assertAtBedside(d, world, "D-01", 101);
  assert.equal(d.attenderOf("P-001"), "D-01");
  assert.equal(d.visualStatus("P-001"), "siendo atendido");
  assert.equal(d.entity("P-001").flags.alert, false);
  assertRobotsHome(d, world);
  assert.equal(d.robotsFree(), 2);
});

test("caso 1 con camillero: él mismo lo empuja a la cama, sin robot", () => {
  const { d, h, world, send } = setup({ staff: [orderly("O-01")], n: 1 });
  let minFree = 2;
  let pushed = false;
  watch(d, () => {
    minFree = Math.min(minFree, d.robotsFree());
    const o = d.entity("O-01");
    if (o.carrying === "P-001") {
      pushed = true;
      assert.equal(d.visualStatus("O-01"), "transportando");
      assert.equal(d.visualStatus("P-001"), "en traslado");
      assert.equal(d.entity("P-001").anim, "stretcher");
    }
  });
  send(h.attack("P-001"));
  settle(d, 2);
  assert.ok(pushed, "el camillero llevó la camilla");
  assert.equal(minFree, 2, "ningún robot salió");
  assertInBed(d, world, "P-001", 101);
  assertAtBedside(d, world, "O-01", 101);
  assert.equal(d.visualStatus("P-001"), "siendo atendido");
});

test("caso 2: sin cama lo atienden en el pasillo; al liberarse una cama, robot y doctor al cuarto", () => {
  const { d, h, world, send } = setup({ rooms: [101], staff: [doctor("D-01"), doctor("D-02")], n: 2 });
  send(h.attack("P-001"));
  settle(d, 2);
  const r = send(h.attack("P-002"));
  assert.deepEqual(r.events.map((e) => e.type), ["attackStarted", "queuedForRoom", "attentionAssigned"]);
  settle(d, 2);
  const p2 = d.entity("P-002");
  const d2 = d.entity("D-02");
  assert.equal(d.bedOf("P-002"), 0);
  assert.equal(roomAt(world, p2.tile.tx, p2.tile.ty), null, "sigue en el pasillo");
  assert.ok(manhattan(d2.tile, p2.tile) <= 2, "D-02 a su lado");
  assert.ok(!sameTile(d2.tile, p2.tile), "sin apilarse");
  assert.equal(d.visualStatus("P-002"), "siendo atendido");
  assert.equal(d.visualStatus("D-02"), "atendiendo");
  assert.equal(p2.flags.alert, false);

  const w = send(h.wake("P-001"));
  assert.deepEqual(w.events.map((e) => e.type), ["patientWoke", "roomAssigned"]);
  assert.equal(w.events[1].fromQueue, true);
  settle(d, 2, () => d.entity("P-001").state === "Caminando");
  assertInBed(d, world, "P-002", 101);
  assertAtBedside(d, world, "D-02", 101);
  assert.equal(d.visualStatus("P-001"), "caminando");
  assert.equal(d.visualStatus("D-01"), "patrullando");
  assertRobotsHome(d, world);
});

test("caso 3: con cama y sin personal espera en la cama; al liberarse alguien, va al bedside", () => {
  const { d, h, world, send } = setup({ rooms: [101, 102], staff: [doctor("D-01")], n: 2 });
  send(h.attack("P-001"));
  settle(d, 2);
  const r = send(h.attack("P-002"));
  assert.deepEqual(r.events.map((e) => e.type), ["attackStarted", "roomAssigned", "queuedForStaff"]);
  settle(d, 2);
  assertInBed(d, world, "P-002", 102);
  assert.equal(d.attenderOf("P-002"), "");
  assert.equal(d.visualStatus("P-002"), "esperando");
  assertRobotsHome(d, world);

  const w = send(h.wake("P-001"));
  assert.deepEqual(w.events.map((e) => e.type), ["patientWoke", "attentionAssigned"]);
  settle(d, 2);
  assertAtBedside(d, world, "D-01", 102);
  assert.equal(d.visualStatus("P-002"), "siendo atendido");
});

test("caso 4: sin cama ni personal sigue dormido donde cayó con flags.alert", () => {
  const { d, h, world, send } = setup({ rooms: [101], staff: [doctor("D-01")], n: 2 });
  send(h.attack("P-001"));
  settle(d, 2);
  const before = { ...d.entity("P-002").tile };
  let minFree = 2;
  watch(d, () => {
    minFree = Math.min(minFree, d.robotsFree());
  });
  const r = send(h.attack("P-002"));
  assert.deepEqual(r.events.map((e) => e.type), ["attackStarted", "queuedForRoom", "queuedForStaff"]);
  settle(d, 2);
  const p2 = d.entity("P-002");
  assert.ok(manhattan(p2.tile, before) <= 1, "cae donde está");
  assert.equal(p2.flags.alert, true);
  assert.equal(p2.anim, "sleep");
  assert.equal(d.visualStatus("P-002"), "esperando");
  assert.equal(d.bedOf("P-002"), 0);
  assert.equal(minFree, 2, "nadie sale por él");
  assert.equal(roomAt(world, p2.tile.tx, p2.tile.ty), null);
});

test("escenario: paso 6, P-001 despierta y P-004 recibe la 101 y a D-01", () => {
  const h = scenarioHospital();
  const d = new Director(WORLD3, { robots: 2, rng: seededRng(3) });
  d.sync(h.snapshot());
  simulate(d, { seconds: 2 });
  for (const step of SCENARIO_STEPS.slice(0, 5)) {
    const r = step.run(h);
    d.apply(r.events, r.snapshot);
    settle(d, 2);
  }
  assert.equal(d.entity("P-004").flags.alert, true, "Wilfrido en las dos colas");
  assert.equal(d.visualStatus("P-004"), "esperando");
  assertInBed(d, WORLD3, "P-003", 103);
  assertAtBedside(d, WORLD3, "O-01", 103);

  const r6 = SCENARIO_STEPS[5].run(h);
  assert.deepEqual(r6.events, [
    { type: "patientWoke", patient: "P-001", room: 101, staff: "D-01" },
    { type: "roomAssigned", patient: "P-004", room: 101, fromQueue: true },
    { type: "attentionAssigned", patient: "P-004", staff: "D-01", fromQueue: true },
  ]);
  d.apply(r6.events, r6.snapshot);
  assert.equal(d.visualStatus("P-001"), "despertando");
  assert.equal(d.entity("P-001").anim, "wake");
  assert.equal(d.bubbles.length, 1, "globo al despertar");
  settle(d, 2, () => d.entity("P-001").state === "Caminando");
  simulate(d, { seconds: 10 });

  const p1 = d.entity("P-001");
  assert.equal(d.visualStatus("P-001"), "caminando");
  assert.equal(d.bedOf("P-001"), 0);
  assert.equal(roomAt(WORLD3, p1.tile.tx, p1.tile.ty), null, "P-001 salió de la habitación");
  assertInBed(d, WORLD3, "P-004", 101);
  assertAtBedside(d, WORLD3, "D-01", 101);
  assert.equal(d.visualStatus("P-004"), "siendo atendido");
  assert.equal(d.entity("P-004").flags.alert, false);
  assertRobotsHome(d, WORLD3);
  assert.equal(d.robotsFree(), 2);
});

test("camillas insuficientes: con 1 robot y 2 traslados, el segundo espera y luego se hace", () => {
  const { d, h, world, send } = setup({ rooms: [101, 102], staff: [doctor("D-01"), doctor("D-02")], n: 2, robots: 1 });
  send(h.attack("P-001"));
  send(h.attack("P-002"));
  // El traslado de P-002 se pide al terminar su caída (FIFO por paciente).
  simulate(d, { seconds: 1 });
  assert.equal(d.pendingTransfers.length, 1);
  assert.equal(d.robotsFree(), 0);
  let sawWaiting = false;
  let order = [];
  watch(d, () => {
    const r = d.entity("R-1");
    if (r.carrying && order.at(-1) !== r.carrying) order.push(r.carrying);
    if (r.carrying === "P-001") {
      assert.equal(d.robotsFree(), 0);
      assert.equal(d.visualStatus("P-002"), "esperando");
      assert.equal(d.entity("P-002").carriedBy, null);
      sawWaiting = true;
    }
  });
  settle(d, 1);
  assert.ok(sawWaiting);
  assert.deepEqual(order, ["P-001", "P-002"], "en orden de llegada");
  assertInBed(d, world, "P-001", 101);
  assertInBed(d, world, "P-002", 102);
  assertAtBedside(d, world, "D-01", 101);
  assertAtBedside(d, world, "D-02", 102);
  assertRobotsHome(d, world);
});

test("eventos encadenados del mismo paciente se animan en orden, sin perderse", () => {
  const { d, h, world, send } = setup({ rooms: [101], staff: [doctor("D-01")], n: 1 });
  const seen = [];
  watch(d, () => {
    const st = d.stateOf("P-001");
    if (seen.at(-1) !== st) seen.push(st);
  });
  // Tres Results seguidos sin dejar avanzar la animación.
  send(h.attack("P-001"));
  send(h.wake("P-001"));
  send(h.attack("P-001", LOC.cafeteria));
  settle(d, 2);
  const firstAttack = seen.indexOf("Atacado");
  const wake = seen.indexOf("Despertando");
  const secondAttack = seen.indexOf("Atacado", wake);
  assert.ok(firstAttack >= 0 && wake > firstAttack && secondAttack > wake, seen.join(" > "));
  assertInBed(d, world, "P-001", 101);
  assertAtBedside(d, world, "D-01", 101);
});

test("converge al snapshot aunque falten eventos", () => {
  const { d, h, world } = setup({ rooms: [101, 102], staff: [doctor("D-01"), orderly("O-01")], n: 3 });
  h.attack("P-001");
  h.attack("P-002");
  const r = h.attack("P-003"); // sin cama
  // Solo llega el último snapshot, sin eventos.
  d.apply([], r.snapshot);
  settle(d, 2, () => d.entities.filter((e) => e.kind === "patient").every((e) => e.state === "Dormido"));
  settle(d, 2);
  assertInBed(d, world, "P-001", 101);
  assertInBed(d, world, "P-002", 102);
  assertAtBedside(d, world, "D-01", 101);
  assertAtBedside(d, world, "O-01", 102);
  assert.equal(d.entity("P-003").flags.alert, true);
  assert.equal(d.visualStatus("P-003"), "esperando");

  // Y al revés: despiertan todos de golpe.
  const s = h.snapshot();
  for (const p of s.patients) Object.assign(p, { asleep: false, room: 0, attendedBy: "", state: "Awake", location: 0 });
  for (const st of s.staff) st.busyWith = "";
  s.roomQueue = [];
  s.staffQueue = [];
  d.apply([], s);
  settle(d, 2, () => d.entities.every((e) => ["Caminando", "Patrullando", "EnBase"].includes(e.state)));
  assert.equal(d.visualStatus("D-01"), "patrullando");
  assert.equal(d.entity("P-003").flags.alert, false);
});

test("sync: quien llega dormido aparece en su sitio y quien lo atiende a su lado", () => {
  const h = scenarioHospital();
  for (const step of SCENARIO_STEPS.slice(0, 4)) step.run(h);
  const d = new Director(WORLD3, { robots: 3, rng: seededRng(1) });
  d.sync(h.snapshot());
  assertInBed(d, WORLD3, "P-001", 101);
  assertInBed(d, WORLD3, "P-002", 102);
  assertInBed(d, WORLD3, "P-003", 103);
  assertAtBedside(d, WORLD3, "D-01", 101);
  assertAtBedside(d, WORLD3, "D-02", 102);
  assertAtBedside(d, WORLD3, "O-01", 103);
  assert.equal(d.locationOf("P-004"), "Main Hallway");
  assert.equal(d.entity("P-004").flags.alert, true);
  assert.equal(d.visualStatus("P-005"), "caminando");
  assert.equal(d.robotsFree(), 3);
  // No se mueve nadie que no deba.
  simulate(d, { seconds: 10 });
  assertInBed(d, WORLD3, "P-001", 101);
  assertAtBedside(d, WORLD3, "D-01", 101);
  assert.equal(d.locationOf("P-004"), "Main Hallway");
  // sync no destruye ni duplica.
  const count = d.entities.length;
  d.sync(h.snapshot());
  d.sync({ ...h.snapshot(), patients: [], staff: [] });
  assert.equal(d.entities.length, count);
});

test("los nuevos aparecen en la entrada y el personal libre patrulla los pasillos", () => {
  const { d, h, send } = setup({ staff: [doctor("D-01")], n: 1 });
  send(h.admit("P-009"));
  send(h.hire("O-07", "orderly"));
  for (const id of ["P-009", "O-07"]) {
    const e = d.entity(id);
    assert.ok(manhattan(e.tile, WORLD3.spawn) <= 3, `${id} cerca de la entrada`);
  }
  assert.equal(d.entity("O-07").kind, "orderly");
  const zonesSeen = new Set();
  watch(d, () => {
    const s = d.entity("D-01");
    if (!s.moving && s.state === "Patrullando") zonesSeen.add(zoneAt(WORLD3, s.tile.tx, s.tile.ty)?.location ?? "?");
  });
  simulate(d, { seconds: 60 });
  for (const z of zonesSeen) {
    if (z !== "?") assert.ok(z.endsWith("Hallway") || z === "Main Entrance", `patrulla en ${z}`);
  }
  assert.equal(d.visualStatus("O-07"), "patrullando");
});

test("locationOf devuelve nombres de hospital.Location y los despiertos no entran a habitaciones", () => {
  const { d } = setup({ staff: [doctor("D-01")], n: 6 });
  assert.equal(d.locationOf("nadie"), null);
  for (let i = 0; i < 90; i++) {
    simulate(d, { seconds: 1 });
    for (const e of d.entities.filter((x) => x.kind === "patient")) {
      const loc = d.locationOf(e.id);
      assert.ok(GO_LOCATIONS.has(loc), `${e.id}: ${loc}`);
      assert.equal(roomAt(WORLD3, e.tile.tx, e.tile.ty), null, `${e.id} entró a una habitación`);
    }
  }
});

test("pacientes quietos no se apilan en el mismo tile", () => {
  const world = generateWorld({ rooms: 6 });
  const { d } = setup({ world, rooms: [101, 102, 103, 104, 105, 106], staff: [doctor("D-01"), orderly("O-01")], n: 9, seed: 11 });
  let checks = 0;
  for (let i = 0; i < 60; i++) {
    simulate(d, { seconds: 1 });
    const still = d.entities.filter((e) => !e.moving && !e.carriedBy && !d.bedOf(e.id));
    const keys = still.map((e) => `${e.tile.tx},${e.tile.ty}`);
    assert.equal(new Set(keys).size, keys.length, `apilados: ${keys.join(" ")}`);
    checks++;
  }
  assert.equal(checks, 60);
});

test("pick encuentra la entidad bajo el punto de mundo", () => {
  const { d } = setup({ staff: [doctor("D-01")], n: 1 });
  const p = d.entity("P-001");
  assert.deepEqual(d.pick(p.x + 3, p.y - 3), { kind: "patient", id: "P-001" });
  const r = d.entity("R-1");
  assert.deepEqual(d.pick(r.x, r.y), { kind: "robot", id: "R-1" });
  const s = d.entity("D-01");
  assert.deepEqual(d.pick(s.x, s.y), { kind: "doctor", id: "D-01" });
  assert.equal(d.pick(-100, -100), null);
});

test("visualStatus usa el vocabulario del contrato", () => {
  const allowed = new Set([
    "caminando", "atacado", "esperando", "en traslado", "siendo atendido", "despertando",
    "patrullando", "atendiendo", "transportando", "en base",
  ]);
  const h = scenarioHospital();
  const d = new Director(WORLD3, { robots: 2, rng: seededRng(5) });
  d.sync(h.snapshot());
  watch(d, () => {
    for (const e of d.entities) assert.ok(allowed.has(d.visualStatus(e.id)), `${e.id}: ${d.visualStatus(e.id)}`);
  });
  for (const step of SCENARIO_STEPS) {
    const r = step.run(h);
    d.apply(r.events, r.snapshot);
    simulate(d, { seconds: 8 });
  }
  settle(d, 2);
  assert.equal(d.visualStatus("nadie"), "");
});

test("determinismo: con el mismo rng, el mismo recorrido", () => {
  const run = (seed) => {
    const h = scenarioHospital();
    const d = new Director(WORLD3, { robots: 2, rng: seededRng(seed) });
    d.sync(h.snapshot());
    simulate(d, { seconds: 4 });
    for (const step of SCENARIO_STEPS) {
      const r = step.run(h);
      d.apply(r.events, r.snapshot);
      simulate(d, { seconds: 6 });
    }
    simulate(d, { seconds: 20 });
    return JSON.stringify(d.entities.map((e) => [e.id, e.x.toFixed(3), e.y.toFixed(3), e.state, e.anim, e.dir]));
  };
  assert.equal(run(42), run(42));
  assert.notEqual(run(42), run(43));
});

test("dt grande (velocidad ×4) no rompe el movimiento ni salta tiles inválidos", () => {
  const { d, h, world, send } = setup({ staff: [doctor("D-01")], n: 2 });
  send(h.attack("P-001"));
  simulate(d, { seconds: MAX_T, dt: 0.4, until: () => d.settled && d.robotsFree() === 2 && staffArrived(d) });
  assertInBed(d, world, "P-001", 101);
  assertAtBedside(d, world, "D-01", 101);
  for (const e of d.entities) {
    if (!d.bedOf(e.id)) assert.ok(world.walkable(e.tile.tx, e.tile.ty), `${e.id} en tile caminable`);
  }
  d.update(-1);
  d.update(NaN);
});

test("el ataque ocurre en la zona que dice la lógica aunque el cuadrito esté en otra", () => {
  const h = scenarioHospital();
  const d = new Director(WORLD3, { robots: 2, rng: seededRng(5) });
  d.sync(h.snapshot()); // todos aparecen en la entrada
  for (const step of SCENARIO_STEPS.slice(0, 4)) {
    const r = step.run(h);
    d.apply(r.events, r.snapshot);
  }
  simulate(d, { seconds: 0.2 });
  assert.equal(d.locationOf("P-001"), "Cafeteria");
  assert.equal(d.locationOf("P-004"), "Main Hallway");
  assert.equal(d.locationOf("P-003"), "Waiting Room");
});
