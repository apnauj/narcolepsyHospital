// Las escenas y widgets no tocan el DOM al importarse: así se pueden cargar
// en Node. Aquí se prueban el mapa provisional y que todo importe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeholderLayout, pickPlaceholder } from "../js/scenes/placeholder.js";
import { snapshot } from "./ui-fixtures.js";

test("todos los módulos de ui y scenes se importan sin DOM", async () => {
  const modules = [
    "../js/ui/queuePanel.js",
    "../js/ui/indicators.js",
    "../js/ui/toolbar.js",
    "../js/ui/card.js",
    "../js/ui/log.js",
    "../js/ui/bubble.js",
    "../js/ui/queries.js",
    "../js/scenes/menu.js",
    "../js/scenes/config.js",
    "../js/scenes/game.js",
    "../js/scenes/scenario.js",
  ];
  for (const m of modules) await import(m);
  const { QueuePanel } = await import("../js/ui/queuePanel.js");
  const { createScenarioScene } = await import("../js/scenes/scenario.js");
  assert.equal(typeof QueuePanel, "function");
  assert.equal(typeof createScenarioScene, "function");
});

test("la escena de juego expone los puntos de conexión", async () => {
  const { createPlayScene } = await import("../js/scenes/game.js");
  const app = { config: { robots: 2, speed: 2, showQueues: true }, canvas: null, showScene() {} };
  const scene = createPlayScene({}, app, { mode: "free" });
  for (const fn of ["mount", "unmount", "update", "draw", "onResult", "selectAt", "locationForAttack", "connectStage", "robotsFree"]) {
    assert.equal(typeof scene[fn], "function", fn);
  }
  assert.deepEqual(scene.robotsFree(), { free: 2, total: 2 });
  // Con un director falso, locationForAttack usa locationOf.
  const director = { locationOf: () => "Cafeteria", update() {}, sync() {}, apply() {}, draw() {}, pick: () => null, visualStatus: () => "" };
  const withDirector = createPlayScene({ director }, app, { mode: "free" });
  withDirector.state.locations = [{ id: 34, name: "Cafeteria" }, { id: 6, name: "Main Hallway" }];
  assert.equal(withDirector.locationForAttack("P-001"), 34);
});

test("pausa congela update y la velocidad multiplica dt", async () => {
  const { createPlayScene } = await import("../js/scenes/game.js");
  const seen = [];
  const director = { update: (dt) => seen.push(dt) };
  const app = { config: { robots: 1, speed: 4, showQueues: true }, canvas: null, showScene() {} };
  const scene = createPlayScene({ director }, app, { mode: "free" });
  scene.update(0.5);
  scene.state.paused = true;
  scene.update(0.5);
  assert.deepEqual(seen, [2]);
});

test("mapa provisional: cada paciente y miembro del personal se puede clicar", () => {
  const snap = snapshot();
  const layout = placeholderLayout(snap);
  assert.equal(layout.rooms.length, 3);
  for (const it of layout.items) {
    assert.deepEqual(pickPlaceholder(layout, it.x + 1, it.y + 1), { kind: it.kind, id: it.id });
    assert.ok(it.x >= 0 && it.x + it.w <= 384 && it.y >= 0 && it.y + it.h <= 216, it.id);
  }
  assert.equal(pickPlaceholder(layout, 383, 110), null);
});

test("mapa provisional cabe con 10 habitaciones, 30 pacientes y 12 de personal", () => {
  const snap = {
    rooms: Array.from({ length: 10 }, (_, i) => ({ number: 101 + i, occupants: [], capacity: 1 })),
    patients: Array.from({ length: 30 }, (_, i) => ({ id: `P-${i}`, asleep: i % 2 === 0, room: 0 })),
    staff: Array.from({ length: 12 }, (_, i) => ({ id: `D-${i}`, kind: "doctor" })),
  };
  const layout = placeholderLayout(snap);
  for (const r of layout.rooms) assert.ok(r.x + r.w <= 384);
  for (const it of layout.items) assert.ok(it.x + it.w <= 384 && it.y + it.h <= 216, it.id);
});
