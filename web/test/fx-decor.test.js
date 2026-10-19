// Decoración animada (qué se anima y cuándo) y la sirena del robot.
import { test } from "node:test";
import assert from "node:assert/strict";

import { generateWorld, TILE_SIZE } from "../js/world/index.js";
import { Director } from "../js/entities/index.js";
import {
  ANIMATED_DECOR, animatedDecor, dockedPads, drawAnimatedDecor, fanFrame, isAnimating,
  occupiedRooms, tvFrame, ecgOffset, picoBeat, PICO_BEAT, TV_GOAL_EVERY,
} from "../js/fx/decor.js";
import { createFx, sirenRobots } from "../js/fx/index.js";
import { FakeHospital, seededRng } from "./entities-fixtures.js";
import { FakeDirector, callsOf, ent, fakeCtx, flatCamera, step } from "./fx-fixtures.js";

const S = TILE_SIZE;
const SILENT = { beep() {}, snore() {}, siren() {} };

test("se animan ventiladores, TV, monitores, cargadores y picó; el resto no", () => {
  for (const rooms of [2, 3, 7, 10]) {
    const world = generateWorld({ rooms });
    const items = animatedDecor(world);
    const kinds = new Set(items.map((i) => i.kind));
    for (const k of ANIMATED_DECOR) assert.ok(kinds.has(k), `${rooms} habitaciones: hay ${k}`);
    for (const i of items) assert.ok(ANIMATED_DECOR.includes(i.kind));
    // Lo que no se anima se queda como lo pintó el painter.
    const still = world.decor.filter((d) => !ANIMATED_DECOR.includes(d.kind)).map((d) => d.kind);
    for (const k of ["chair", "plant", "bed", "doorNumber"]) assert.ok(still.includes(k), k);

    // Un monitor por habitación, cada uno sabe de qué cuarto es.
    const monitors = items.filter((i) => i.kind === "monitor");
    assert.deepEqual(monitors.map((m) => m.room).sort(), world.rooms.map((r) => r.number).sort());
    // Cada cargador tiene su puesto de la base de camillas.
    const chargers = items.filter((i) => i.kind === "charger");
    assert.equal(chargers.length, world.robotBase.length);
    for (const c of chargers) assert.ok(world.robotBase.some((p) => p.tx === c.pad.tx && p.ty === c.pad.ty));
  }
  assert.deepEqual(animatedDecor(null), []);
});

test("el monitor late solo con la cama ocupada y el paciente acostado", () => {
  const monitor = { kind: "monitor", room: 101 };
  assert.equal(isAnimating(monitor, { occupied: new Set() }), false);
  assert.equal(isAnimating(monitor, { occupied: new Set([101]) }), true);
  assert.equal(isAnimating({ kind: "fan" }), true);
  assert.equal(isAnimating({ kind: "chair" }), false);

  const snap = {
    rooms: [
      { number: 101, occupants: ["P-001"] },
      { number: 102, occupants: [] },
      { number: 103, occupants: ["P-003"] },
    ],
  };
  assert.deepEqual([...occupiedRooms(snap, null)].sort(), [101, 103], "sin director: el snapshot");
  const d = new FakeDirector();
  d.beds.set("P-001", 101); // P-003 todavía va en camilla
  assert.deepEqual([...occupiedRooms(snap, d)], [101]);
  assert.equal(occupiedRooms(null, d).size, 0);

  // Dibujo: un monitor de un cuarto vacío no pinta nada.
  const ctx = fakeCtx();
  drawAnimatedDecor(ctx, { kind: "monitor", tx: 1, ty: 1, room: 102 }, 1, { occupied: new Set([101]) });
  assert.equal(callsOf(ctx, "fillRect").length, 0);
  drawAnimatedDecor(ctx, { kind: "monitor", tx: 1, ty: 1, room: 101 }, 1, { occupied: new Set([101]) });
  const rects = callsOf(ctx, "fillRect");
  assert.ok(rects.length >= 9, "pantalla y línea");
  for (const [, x, y, w, h] of rects) {
    assert.ok(x >= S && x + w <= 2 * S && y >= S && y + h <= 2 * S, "dentro de su tile");
    assert.ok(Number.isInteger(x) && Number.isInteger(y), "pixeles enteros");
  }
});

test("cuadros: ventilador en 4, TV en 3 más «GOL», monitor y picó avanzan", () => {
  const fans = new Set(Array.from({ length: 40 }, (_, i) => fanFrame(i / 40)));
  assert.deepEqual([...fans].sort(), [0, 1, 2, 3]);
  const tv = new Set(Array.from({ length: 300 }, (_, i) => tvFrame((i / 300) * TV_GOAL_EVERY)));
  assert.deepEqual([...tv].sort(), [0, 1, 2, 3]);
  assert.equal(tvFrame(TV_GOAL_EVERY - 0.1), 3, "«GOL» al final del ciclo");
  assert.notEqual(ecgOffset(0), ecgOffset(0.5));
  assert.equal(picoBeat(0).thump, true);
  assert.equal(picoBeat(PICO_BEAT / 2).thump, false);
  assert.equal(picoBeat(PICO_BEAT * 3 + 0.01).beat, 3);
});

test("el cargador sabe si su robot está en el puesto", () => {
  const pad = { tx: 11, ty: 1 };
  const at = (tx, ty) => ({ x: tx * S + S / 2, y: ty * S + S / 2 });
  const docked = ent("robot", "R-1", at(11, 1).x, at(11, 1).y, { state: "EnBase" });
  const leaving = ent("robot", "R-2", at(13, 1).x + 3, at(13, 1).y, { state: "YendoAlPaciente" });
  const loaded = ent("robot", "R-3", at(15, 1).x, at(15, 1).y, { carrying: "P-001" });
  const set = dockedPads([docked, leaving, loaded, ent("patient", "P-9", at(13, 1).x, at(13, 1).y)]);
  assert.deepEqual([...set], ["11,1"]);

  const item = { kind: "charger", tx: 11, ty: 0, pad };
  const on = fakeCtx();
  drawAnimatedDecor(on, item, 0.5, { docked: set });
  const off = fakeCtx();
  drawAnimatedDecor(off, item, 0.1, { docked: new Set() });
  const colors = (ctx) => ctx.calls.filter((c) => c[0] === "set:fillStyle").map((c) => c[1]);
  assert.ok(colors(on).includes("#3fa34d"), "barra verde cargando");
  assert.ok(colors(off).includes("#d62839"), "luz roja sin robot");
});

test("drawWorldFx dibuja solo efectos, solo lo visible y con la cámara del mundo", () => {
  const world = generateWorld({ rooms: 3 });
  const fx = createFx(world, { rng: () => 0.5, phrases: {}, audio: SILENT });
  fx.update(0.2, new FakeDirector());
  const ctx = fakeCtx();
  const camera = flatCamera({ x: 0, y: 0 });
  fx.drawWorldFx(ctx, camera);
  const names = new Set(ctx.calls.map((c) => c[0]));
  assert.ok(!names.has("drawImage") && !names.has("putImageData"), "no reemplaza tiles");
  assert.ok(callsOf(ctx, "translate").some((c) => c[1] === -0 || c[1] === 0));
  const rects = callsOf(ctx, "fillRect");
  assert.ok(rects.length > 0);
  for (const [, x, y] of rects) assert.ok(x < camera.visibleW + S && y < camera.visibleH + S, `visible (${x},${y})`);
  // Zoom ×2: el contexto se escala con un factor entero.
  const ctx2 = fakeCtx();
  fx.drawWorldFx(ctx2, flatCamera({ zoom: 2 }));
  assert.ok(callsOf(ctx2, "scale").some((c) => c[1] === 2 && c[2] === 2));
});

// La sirena se reconoce por su domo de 3×2.
const sirensDrawn = (ctx) => callsOf(ctx, "fillRect").filter((c) => c[3] === 3 && c[4] === 2).length;

test("la sirena solo sale cuando el robot carga a alguien", () => {
  const free = ent("robot", "R-1", 100, 100);
  const busy = ent("robot", "R-2", 140, 100, { carrying: "P-001" });
  assert.deepEqual(sirenRobots([free, busy, ent("orderly", "O-01", 0, 0, { carrying: "P-002" })]).map((r) => r.id), ["R-2"]);
  assert.deepEqual(sirenRobots(null), []);

  const d = new FakeDirector([free, busy]);
  const fx = createFx(generateWorld({ rooms: 2 }), { rng: () => 0.5, phrases: {}, audio: SILENT });
  const ctx = fakeCtx();
  fx.drawEntityFx(ctx, flatCamera(), d);
  assert.equal(sirensDrawn(ctx), 1);
  busy.carrying = undefined;
  const ctx2 = fakeCtx();
  fx.drawEntityFx(ctx2, flatCamera(), d);
  assert.equal(sirensDrawn(ctx2), 0);
});

test("con el Director real: sirena mientras el robot lleva al paciente, y suena al recogerlo", () => {
  const world = generateWorld({ rooms: 3 });
  const h = new FakeHospital({ staff: [{ id: "D-01", name: "D-01", kind: "doctor" }], patients: [{ id: "P-001" }, { id: "P-002" }] });
  const d = new Director(world, { robots: 2, rng: seededRng(5) });
  let sirens = 0;
  const fx = createFx(world, { rng: seededRng(9), phrases: {}, audio: { beep() {}, snore() {}, siren: () => sirens++ } });
  d.sync(h.snapshot());
  step(d, fx, { seconds: 2 });

  const r = h.run(() => h.attack("P-001"));
  d.apply(r.events, r.snapshot);
  fx.onEvents(r.events, r.snapshot, d);

  let framesCarrying = 0;
  step(d, fx, {
    seconds: 90,
    until: () => {
      const robots = d.entities.filter((e) => e.kind === "robot");
      const carrying = robots.filter((e) => e.carrying).length;
      const ctx = fakeCtx({ width: 4000, height: 4000 });
      fx.drawEntityFx(ctx, flatCamera({ viewW: 4000, viewH: 4000 }), d);
      assert.equal(sirensDrawn(ctx), carrying, "una sirena por robot cargado");
      if (carrying) framesCarrying++;
      return framesCarrying > 0 && carrying === 0 && d.bedOf("P-001") === 101;
    },
  });
  assert.ok(framesCarrying > 10, "el robot llevó al paciente");
  assert.equal(sirens, 1, "la sirena sonó una vez, al recogerlo");
});
