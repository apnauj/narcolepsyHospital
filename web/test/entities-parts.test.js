// Tests de las piezas de web/js/entities/: movimiento, tareas, renderer,
// dibujo del director, retratos y los datos de apoyo (Locations y el hospital
// falso de los tests).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { generateWorld, Camera, TILE_SIZE } from "../js/world/index.js";
import { Director, SquareRenderer, Entity, SPEED } from "../js/entities/index.js";
import { dirOf, moveAlong, tileCenter } from "../js/entities/entity.js";
import { runTasks, setTasks, walkTo, wait, call, hold, isIdle } from "../js/entities/tasks.js";
import { LOCATION_NAMES, locationName } from "../js/entities/locations.js";
import { FakeHospital, scenarioHospital, SCENARIO_STEPS, seededRng, simulate } from "./entities-fixtures.js";

const WORLD = generateWorld({ rooms: 3 });

/** Contexto 2D falso que registra las llamadas (y sirve para Bubble). */
function fakeCtx() {
  const calls = [];
  const ctx = new Proxy(
    { calls, canvas: { width: 384, height: 216 }, measureText: (t) => ({ width: String(t).length * 5 }) },
    {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => calls.push([key, ...args]);
      },
      set(target, key, value) {
        target[key] = value;
        calls.push([`set:${String(key)}`, value]);
        return true;
      },
    },
  );
  return ctx;
}

test("velocidades: personal más rápido que pacientes, robots constantes", () => {
  assert.ok(SPEED.staff > SPEED.patient);
  assert.equal(new Entity("robot", "R-1", { tx: 1, ty: 1 }).speed, SPEED.robot);
  assert.equal(new Entity("orderly", "O-01", { tx: 1, ty: 1 }).speed, SPEED.staff);
  assert.equal(new Entity("patient", "P-001", { tx: 1, ty: 1 }).speed, SPEED.patient);
});

test("moveAlong recorre el camino, actualiza dir y tile y atraviesa varios tiles en un paso", () => {
  const e = new Entity("patient", "P-001", { tx: 2, ty: 2 });
  const walk = { path: [{ tx: 3, ty: 2 }, { tx: 3, ty: 3 }, { tx: 3, ty: 4 }], checked: false };
  let res = moveAlong(e, walk, 8);
  assert.equal(e.dir, "right");
  assert.equal(res.arrived, false);
  assert.deepEqual(e.tile, { tx: 2, ty: 2 });
  res = moveAlong(e, walk, 8 + 2 * TILE_SIZE);
  assert.equal(res.arrived, true);
  assert.equal(e.dir, "down");
  assert.deepEqual(e.tile, { tx: 3, ty: 4 });
  assert.deepEqual({ x: e.x, y: e.y }, tileCenter({ tx: 3, ty: 4 }));
  assert.equal(dirOf(-3, 1), "left");
  assert.equal(dirOf(0, 0, "up"), "up");
});

test("moveAlong se detiene si el siguiente tile no se puede pisar", () => {
  const e = new Entity("doctor", "D-01", { tx: 2, ty: 2 });
  const walk = { path: [{ tx: 3, ty: 2 }], checked: false };
  const res = moveAlong(e, walk, 100, () => false);
  assert.equal(res.blocked, true);
  assert.deepEqual(e.tile, { tx: 2, ty: 2 });
});

test("las tareas corren en secuencia y setTasks reemplaza la que va", () => {
  const d = new Director(WORLD, { robots: 1, rng: seededRng(1) });
  const e = new Entity("doctor", "X", WORLD.spawn);
  const log = [];
  setTasks(e, d, [call(() => log.push("a")), wait(1, "idle"), call(() => log.push("b")), hold("attend")]);
  runTasks(e, d, 0.5);
  assert.deepEqual(log, ["a"]);
  runTasks(e, d, 0.6);
  assert.deepEqual(log, ["a", "b"]);
  assert.equal(e.anim, "attend");
  assert.equal(isIdle(e), false);
  setTasks(e, d, []);
  assert.equal(isIdle(e), true);
});

test("walkTo llega por A* y re-planifica alrededor de alguien quieto", () => {
  const d = new Director(WORLD, { robots: 1, rng: seededRng(1) });
  // Un pasillo de 3 de ancho: estorbo en el centro del camino recto.
  const hall = WORLD.zones.find((z) => z.location === "Main Hallway").rect;
  const y = hall.ty + 1;
  const from = { tx: hall.tx + 2, ty: y };
  const to = { tx: hall.tx + 10, ty: y };
  const walker = d.add(new Entity("doctor", "W", from));
  const blocker = d.add(new Entity("patient", "B", { tx: hall.tx + 6, ty: y }));
  setTasks(walker, d, [walkTo(to)]);
  runTasks(walker, d, 0); // planifica con el camino libre
  d.reserve(blocker, blocker.tile); // alguien se queda quieto en medio después
  let touched = false;
  for (let i = 0; i < 200 && !isIdle(walker); i++) {
    runTasks(walker, d, 1 / 30);
    if (walker.tile.tx === blocker.tile.tx && walker.tile.ty === blocker.tile.ty) touched = true;
  }
  assert.deepEqual(walker.tile, to);
  assert.equal(touched, false, "rodeó al que estaba quieto");
  assert.equal(walker.anim, "idle");
});

test("SquareRenderer dibuja cuerpo, «Z», «!» y camilla", () => {
  const r = new SquareRenderer();
  const sleeper = new Entity("patient", "P-004", { tx: 1, ty: 1 });
  sleeper.setAnim("sleep");
  sleeper.flags.alert = true;
  const ctx = fakeCtx();
  r.drawEntity(ctx, sleeper, 50, 50);
  const rects = ctx.calls.filter((c) => c[0] === "fillRect");
  assert.ok(rects.some((c) => c[1] === 44 && c[2] === 44 && c[3] === 12 && c[4] === 12), "cuadrito de 12×12 centrado");
  const colors = ctx.calls.filter((c) => c[0] === "set:fillStyle").map((c) => c[1]);
  assert.ok(colors.includes("#d62839"), "marca de alerta");
  assert.ok(colors.includes("#2f80c2"), "Z de dormido");

  const ctx2 = fakeCtx();
  const carried = new Entity("patient", "P-001", { tx: 1, ty: 1 });
  carried.setAnim("stretcher");
  r.drawEntity(ctx2, carried, 50, 50);
  assert.ok(ctx2.calls.some((c) => c[0] === "set:fillStyle" && c[1] === "#ffffff"), "camilla");

  // Colores: por clase, y el del paciente según su ID (estable).
  const color = (e) => {
    const c = fakeCtx();
    r.drawEntity(c, e, 20, 20);
    return c.calls.filter((x) => x[0] === "set:fillStyle")[1][1];
  };
  assert.equal(color(new Entity("patient", "P-001", { tx: 0, ty: 0 })), color(new Entity("patient", "P-001", { tx: 3, ty: 3 })));
  assert.notEqual(color(new Entity("patient", "P-001", { tx: 0, ty: 0 })), color(new Entity("patient", "P-002", { tx: 0, ty: 0 })));
  assert.notEqual(color(new Entity("doctor", "D-01", { tx: 0, ty: 0 })), color(new Entity("orderly", "O-01", { tx: 0, ty: 0 })));
});

test("SquareRenderer sirve como clase o instancia; portrait sin canvas da null", () => {
  assert.equal(typeof SquareRenderer.drawEntity, "function");
  assert.equal(SquareRenderer.portrait("patient", "P-001"), null); // en Node no hay canvas
  const ctx = fakeCtx();
  SquareRenderer.drawEntity(ctx, new Entity("robot", "R-1", { tx: 0, ty: 0 }), 10, 10);
  assert.ok(ctx.calls.length > 0);
});

test("draw ordena por Y, aplica el zoom y dibuja el globo al despertar", () => {
  const h = scenarioHospital();
  const d = new Director(WORLD, { robots: 2, rng: seededRng(2), phrases: { wake: ["¡Erda!"] } });
  d.sync(h.snapshot());
  simulate(d, { seconds: 2 });
  const camera = new Camera(384, 216, WORLD.cols * TILE_SIZE, WORLD.rows * TILE_SIZE);
  camera.centerOn((WORLD.spawn.tx + 0.5) * TILE_SIZE, (WORLD.spawn.ty - 4) * TILE_SIZE);
  const seen = [];
  const renderer = { drawEntity: (_ctx, e, sx, sy) => seen.push({ id: e.id, y: e.y, sx, sy }), portrait: () => null };
  d.draw(fakeCtx(), camera, renderer);
  assert.ok(seen.length > 0, "algo visible cerca de la entrada");
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i - 1].y <= seen[i].y, "orden por Y");
  const first = d.entity(seen[0].id);
  const s = camera.toScreen(first.x, first.y);
  assert.ok(Math.abs(seen[0].sx - s.x) <= 1 && Math.abs(seen[0].sy - s.y) <= 1, "a zoom 1, píxeles de pantalla");

  camera.setZoom(2);
  const zoomed = [];
  const ctx = fakeCtx();
  d.draw(ctx, camera, { drawEntity: (_c, e, sx, sy) => zoomed.push({ e, sx, sy }), portrait: () => null });
  assert.ok(ctx.calls.some((c) => c[0] === "scale" && c[1] === 2), "contexto escalado por el zoom");
  for (const { e, sx, sy } of zoomed) {
    const p = camera.toScreen(e.x, e.y);
    assert.ok(Math.abs(sx * 2 - p.x) <= 1 && Math.abs(sy * 2 - p.y) <= 1);
  }

  for (const step of SCENARIO_STEPS) {
    const r = step.run(h);
    d.apply(r.events, r.snapshot);
    simulate(d, { seconds: 1 });
  }
  assert.equal(d.bubbles.length, 1);
  const ctx3 = fakeCtx();
  d.draw(ctx3, camera, null); // sin renderer usa SquareRenderer
  assert.ok(ctx3.calls.some((c) => c[0] === "fillText" && c[1] === "¡Erda!"), "globo con la frase");
});

test("LOCATION_NAMES coincide con hospital.Location", () => {
  const src = readFileSync(new URL("../../hospital/location.go", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("names := [...]string{"));
  const names = [...block.slice(0, block.indexOf("}")).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...LOCATION_NAMES], names);
  assert.equal(locationName(34), "Cafeteria");
  assert.equal(locationName(0), null);
  assert.equal(locationName(99), null);
});

test("el hospital falso produce los eventos de los ejemplos del contrato", () => {
  const types = (r) => r.events.map((e) => e.type);
  const h = new FakeHospital({
    rooms: [101],
    staff: [{ id: "D-01", name: "D", kind: "doctor" }],
    patients: [{ id: "P-001" }, { id: "P-002" }, { id: "P-003" }],
  });
  assert.deepEqual(types(h.attack("P-001")), ["attackStarted", "roomAssigned", "attentionAssigned"]);
  assert.deepEqual(types(h.attack("P-002")), ["attackStarted", "queuedForRoom", "queuedForStaff"]);
  assert.deepEqual(h.wake("P-001").events, [
    { type: "patientWoke", patient: "P-001", room: 101, staff: "D-01" },
    { type: "roomAssigned", patient: "P-002", room: 101, fromQueue: true },
    { type: "attentionAssigned", patient: "P-002", staff: "D-01", fromQueue: true },
  ]);
  const s = scenarioHospital();
  const results = SCENARIO_STEPS.map((step) => step.run(s));
  assert.equal(results[4].events.length, 0);
  assert.equal(results[4].notices[0].kind, "noRoom");
  assert.deepEqual(results[3].snapshot.roomQueue, ["P-004"]);
  assert.deepEqual(results[3].snapshot.staffQueue, ["P-004"]);
});
