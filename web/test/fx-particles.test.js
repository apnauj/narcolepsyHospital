// Partículas: ciclo de vida, «Zzz» sobre dormidos y «!» al atacar o en alerta.
import { test } from "node:test";
import assert from "node:assert/strict";

import { Particles, bounceHeight, zGlyphFor, fading } from "../js/fx/particles.js";
import { createFx, Z_EVERY, ALERT_EVERY } from "../js/fx/index.js";
import { generateWorld } from "../js/world/index.js";
import { FakeDirector, ent, fakeCtx, flatCamera, step } from "./fx-fixtures.js";

const WORLD = generateWorld({ rooms: 2 });
const SILENT = { beep() {}, snore() {}, siren() {} };
const newFx = (opts = {}) => createFx(WORLD, { rng: () => 0.5, phrases: {}, audio: SILENT, ...opts });

test("una partícula nace, se mueve con su velocidad y muere al cumplir su vida", () => {
  const ps = new Particles();
  const p = ps.emit({ kind: "z", x: 10, y: 20, vx: 4, vy: -8, life: 1 });
  assert.equal(ps.size, 1);
  ps.update(0.5);
  assert.equal(ps.size, 1);
  assert.deepEqual([p.x, p.y, p.age], [12, 16, 0.5]);
  assert.equal(zGlyphFor(p), "z2", "crece con la edad");
  ps.update(0.49);
  assert.equal(fading(p), true, "parpadea al final");
  ps.update(0.02);
  assert.equal(ps.size, 0, "murió");
  ps.update(0); // sin dt no hace nada
  ps.update(Number.NaN);
});

test("aceleración, tope de partículas y huérfanas", () => {
  const ps = new Particles(3);
  const p = ps.emit({ ay: 10, life: 5 });
  ps.update(1);
  assert.equal(p.vy, 10);
  for (let i = 0; i < 5; i++) ps.emit({ kind: "spark", life: 5 });
  assert.equal(ps.size, 3, "se descartan las más viejas");
  ps.emit({ kind: "bang", anchor: "P-001", life: 5 });
  ps.emit({ kind: "bang", anchor: "P-002", life: 5 });
  ps.dropOrphans((id) => id === "P-001");
  assert.equal(ps.count("bang"), 1);
  ps.clear();
  assert.equal(ps.size, 0);
});

test("el salto del «!»: sube, rebota y termina en el piso", () => {
  assert.equal(bounceHeight(0), 0);
  assert.equal(bounceHeight(0.7), 0);
  assert.equal(bounceHeight(-1), 0);
  const heights = Array.from({ length: 70 }, (_, i) => bounceHeight(i / 100));
  assert.equal(Math.max(...heights), 7);
  assert.ok(heights.every((h) => Number.isInteger(h) && h >= 0), "pixeles enteros");
  // El primer salto es el más alto.
  assert.ok(bounceHeight(0.175) > bounceHeight(0.45));
});

test("Zzz: salen sobre los dormidos (sleep y stretcher) y no sobre los despiertos", () => {
  const sleeper = ent("patient", "P-001", 40, 40, { anim: "sleep" });
  const carried = ent("patient", "P-002", 80, 40, { anim: "stretcher" });
  const awake = ent("patient", "P-003", 120, 40, { anim: "walk" });
  const doc = ent("doctor", "D-01", 160, 40, { anim: "sleep" }); // solo pacientes
  const d = new FakeDirector([sleeper, carried, awake, doc]);
  const fx = newFx();
  step(d, fx, { seconds: 3 });
  const zs = fx.particles.list.filter((p) => p.kind === "z");
  assert.ok(zs.length >= 4, `hay Zzz (${zs.length})`);
  for (const z of zs) assert.ok(Math.abs(z.x - 40) < 20 || Math.abs(z.x - 80) < 20, "solo de P-001 y P-002");
  assert.ok(zs.every((z) => z.y < 40), "flotan hacia arriba");

  // Al despertar dejan de salir y las que había se apagan solas.
  sleeper.anim = "wake";
  carried.anim = "idle";
  step(d, fx, { seconds: 3 });
  assert.equal(fx.particles.count("z"), 0);
});

test("Zzz: el ritmo es de una cada Z_EVERY segundos por dormido", () => {
  const d = new FakeDirector([ent("patient", "P-001", 40, 40, { anim: "sleep" })]);
  const fx = newFx();
  let emitted = 0;
  const orig = fx.particles.emit.bind(fx.particles);
  fx.particles.emit = (p) => {
    if (p.kind === "z") emitted++;
    return orig(p);
  };
  step(d, fx, { seconds: 10 });
  const expected = Math.floor((10 - 0.35) / Z_EVERY) + 1;
  assert.ok(Math.abs(emitted - expected) <= 1, `${emitted} ≈ ${expected}`);
});

test("«!»: salta una vez al empezar el ataque y se repite mientras flags.alert", () => {
  const p = ent("patient", "P-001", 50, 50, { anim: "walk" });
  const d = new FakeDirector([p]);
  const fx = newFx();
  step(d, fx, { seconds: 1 });
  assert.equal(fx.particles.count("bang"), 0);

  p.anim = "attack";
  fx.update(1 / 30, d);
  assert.equal(fx.particles.count("bang"), 1, "al empezar la caída");
  const bang = fx.particles.list.find((q) => q.kind === "bang");
  assert.equal(bang.anchor, "P-001", "anclado a la entidad");
  step(d, fx, { seconds: 0.5 });
  assert.equal(fx.particles.count("bang"), 1, "no se repite durante la caída");

  // Dormido sin alerta: no hay más «!».
  p.anim = "sleep";
  step(d, fx, { seconds: 3 });
  assert.equal(fx.particles.count("bang"), 0);

  // En las dos colas: salta cada ALERT_EVERY segundos.
  p.flags.alert = true;
  let seen = 0;
  let prev = 0;
  step(d, fx, {
    seconds: ALERT_EVERY * 3 + 0.1,
    until: () => {
      const n = fx.particles.count("bang");
      if (n > prev) seen++;
      prev = n;
      return false;
    },
  });
  assert.equal(seen, 4, "al empezar la alerta y cada ALERT_EVERY");

  // El «!» sigue a la entidad: se dibuja sobre su cabeza aunque se mueva.
  p.x = 200;
  const ctx = fakeCtx();
  fx.drawEntityFx(ctx, flatCamera(), d);
  const rects = ctx.calls.filter((c) => c[0] === "fillRect" && c[4] === 1);
  assert.ok(rects.some((c) => c[1] >= 197 && c[1] <= 202), "dibujado en la nueva x");
});

test("al despertar salen chispitas; sin director ni dt no pasa nada", () => {
  const p = ent("patient", "P-001", 50, 50, { anim: "sleep" });
  const d = new FakeDirector([p]);
  const fx = newFx();
  fx.update(0.1, d);
  p.anim = "wake";
  fx.update(0.1, d);
  assert.equal(fx.particles.count("spark"), 4);

  const lonely = newFx();
  lonely.update(0.5);
  lonely.update(-1);
  lonely.onEvents(null, null, null);
  lonely.drawWorldFx(fakeCtx(), null);
  lonely.drawEntityFx(fakeCtx(), flatCamera(), null);
});

test("las partículas de una entidad que desaparece se van con ella", () => {
  const p = ent("patient", "P-001", 50, 50, { anim: "walk" });
  const d = new FakeDirector([p]);
  const fx = newFx();
  fx.update(0.1, d);
  p.anim = "attack";
  fx.update(0.1, d);
  assert.equal(fx.particles.count("bang"), 1);
  d.list = [];
  fx.update(0.1, d);
  assert.equal(fx.particles.count("bang"), 0);
});
