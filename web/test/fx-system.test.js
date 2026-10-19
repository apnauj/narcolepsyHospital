// createFx de punta a punta: frases al atacar, «¡Ombe, otra vez!», la
// respuesta del doctor al despertar (con el Director real y el caso de
// prueba) y el sonido silenciado por defecto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { generateWorld } from "../js/world/index.js";
import { Director } from "../js/entities/index.js";
import { createFx, createAudio, AGAIN_TEXT, REPEAT_ATTACKS } from "../js/fx/index.js";
import { SCENARIO_STEPS, scenarioHospital, seededRng, simulate } from "./entities-fixtures.js";
import { FakeDirector, cycleRng, ent, fakeCtx, flatCamera, step } from "./fx-fixtures.js";

const WORLD = generateWorld({ rooms: 3 });
const PHRASES = JSON.parse(readFileSync(new URL("../data/phrases.json", import.meta.url), "utf8"));
const SILENT = { beep() {}, snore() {}, siren() {} };

test("la frase de ataque se dice cuando empieza la caída, no cuando llega el evento", () => {
  const p = ent("patient", "P-001", 60, 60, { anim: "walk" });
  const d = new FakeDirector([p]);
  const fx = createFx(WORLD, { rng: cycleRng([0.1]), phrases: { attack: ["Ajá, y entonces yo le dije…"] }, audio: SILENT });
  fx.update(0.1, d);
  fx.onEvents([{ type: "attackStarted", patient: "P-001", location: 6 }], null, d);
  assert.equal(fx.attacksOf("P-001"), 1);
  assert.equal(fx.pendingLine("P-001"), "Ajá, y entonces yo le dije…");
  fx.update(0.1, d);
  assert.equal(d.said.length, 0, "todavía camina");
  p.anim = "attack";
  fx.update(0.1, d);
  assert.deepEqual(d.said, [{ id: "P-001", text: "Ajá, y entonces yo le dije…" }]);
  assert.equal(fx.pendingLine("P-001"), null);
});

test("no siempre hablan al atacar, y la frase pendiente caduca", () => {
  const p = ent("patient", "P-001", 60, 60, { anim: "walk" });
  const d = new FakeDirector([p]);
  const quiet = createFx(WORLD, { rng: cycleRng([0.99]), phrases: PHRASES, audio: SILENT });
  quiet.onEvents([{ type: "attackStarted", patient: "P-001" }], null, d);
  assert.equal(quiet.pendingLine("P-001"), null, "con rng alto se duerme callado");

  const chatty = createFx(WORLD, { rng: cycleRng([0.1]), phrases: PHRASES, audio: SILENT });
  chatty.onEvents([{ type: "attackStarted", patient: "P-001" }], null, d);
  assert.ok(PHRASES.attack.includes(chatty.pendingLine("P-001")));
  step(d, chatty, { seconds: 9 });
  assert.equal(chatty.pendingLine("P-001"), null);
  assert.equal(d.said.length, 0);
});

test("easter egg: desde el cuarto ataque de la sesión, «¡Ombe, otra vez!»", () => {
  const p = ent("patient", "P-001", 60, 60, { anim: "walk" });
  const d = new FakeDirector([p]);
  const fx = createFx(WORLD, { rng: cycleRng([0.99]), phrases: PHRASES, audio: SILENT });
  for (let i = 1; i <= REPEAT_ATTACKS + 2; i++) {
    p.anim = "walk";
    fx.update(0.1, d);
    fx.onEvents([{ type: "attackStarted", patient: "P-001" }], null, d);
    p.anim = "attack";
    fx.update(0.1, d);
    const last = d.said.at(-1)?.text ?? null;
    if (i <= REPEAT_ATTACKS) assert.equal(last, null, `ataque ${i}: callado (rng alto)`);
    else assert.equal(last, AGAIN_TEXT, `ataque ${i}`);
    d.said = [];
  }
  assert.equal(fx.attacksOf("P-001"), REPEAT_ATTACKS + 2);
  assert.equal(fx.attacksOf("P-999"), 0);
  // Sin frases cargadas también sale.
  const bare = createFx(WORLD, { rng: () => 0.99, phrases: {}, audio: SILENT });
  for (let i = 0; i <= REPEAT_ATTACKS; i++) bare.onEvents([{ type: "attackStarted", patient: "P-001" }], null, d);
  assert.equal(bare.pendingLine("P-001"), AGAIN_TEXT);
});

test("el doctor responde después de que el paciente termina de hablar", () => {
  const p = ent("patient", "P-001", 60, 60, { anim: "sleep" });
  const doc = ent("doctor", "D-01", 76, 60);
  const d = new FakeDirector([p, doc]);
  const fx = createFx(WORLD, { rng: seededRng(4), phrases: PHRASES, audio: SILENT });
  const snap = { staff: [{ id: "D-01", kind: "doctor", busyWith: "" }] };
  fx.onEvents([{ type: "patientWoke", patient: "P-001", room: 101, staff: "D-01" }], snap, d);
  assert.equal(fx.pendingReplies, 1);
  step(d, fx, { seconds: 0.5 });
  assert.equal(d.said.length, 0, "espera el globo del paciente");

  // El director hace hablar al paciente (startWake).
  p.anim = "wake";
  d.say(p, "Ajá, ¿y dónde estoy yo?");
  const patientBubble = d.bubbles[0].bubble;
  step(d, fx, { seconds: 0.5 });
  assert.equal(d.said.length, 1, "mientras escribe, el doctor espera");
  step(d, fx, { seconds: 3, until: () => d.said.length === 2 });
  assert.equal(d.said[1].id, "D-01");
  assert.ok(PHRASES.doctor.includes(d.said[1].text));
  assert.equal(patientBubble.done, true, "el globo del paciente se cierra al responder");
  d.update(0.01); // el director descarta los globos terminados
  assert.equal(d.bubbles.length, 1);
  assert.equal(d.bubbles[0].bubble.accent, "#3fa34d", "el doctor habla en verde");
  assert.equal(fx.pendingReplies, 0);
});

test("solo responde el doctor: ni camilleros ni nadie; y se olvida si el paciente no habla", () => {
  const p = ent("patient", "P-001", 60, 60, { anim: "sleep" });
  const o = ent("orderly", "O-01", 76, 60);
  const d = new FakeDirector([p, o]);
  const fx = createFx(WORLD, { rng: seededRng(4), phrases: PHRASES, audio: SILENT });
  const snap = { staff: [{ id: "O-01", kind: "orderly", busyWith: "" }, { id: "D-01", kind: "doctor", busyWith: "" }] };
  fx.onEvents([
    { type: "patientWoke", patient: "P-001", room: 0, staff: "O-01" },
    { type: "patientWoke", patient: "P-002", room: 0, staff: "" },
  ], snap, d);
  assert.equal(fx.pendingReplies, 0);
  fx.onEvents([{ type: "patientWoke", patient: "P-001", room: 0, staff: "D-01" }], snap, d);
  assert.equal(fx.pendingReplies, 1);
  step(d, fx, { seconds: 21 });
  assert.equal(fx.pendingReplies, 0, "caducó sin globo del paciente");
  assert.equal(d.said.length, 0);
});

test("caso de prueba con el Director real: Toño despierta, habla, y Karen (D-01) le responde", () => {
  const h = scenarioHospital();
  const d = new Director(WORLD, { robots: 2, rng: seededRng(3), phrases: PHRASES });
  const fx = createFx(WORLD, { rng: seededRng(8), phrases: PHRASES, audio: SILENT });
  d.sync(h.snapshot());
  fx.onEvents([], h.snapshot(), d);
  step(d, fx, { seconds: 2 });
  for (const s of SCENARIO_STEPS.slice(0, 5)) {
    const r = s.run(h);
    d.apply(r.events, r.snapshot);
    fx.onEvents(r.events, r.snapshot, d);
    step(d, fx, { seconds: 60, until: () => d.settled });
  }
  // Mientras duermen salen Zzz, y Wilfrido (dos colas) tiene su «!».
  step(d, fx, { seconds: 3 });
  assert.ok(fx.particles.count("z") > 0);
  assert.equal(d.entity("P-004").flags.alert, true);
  assert.ok(fx.particles.list.some((p) => p.kind === "bang" && p.anchor === "P-004") || fx.particles.count("z") > 0);

  const r6 = SCENARIO_STEPS[5].run(h);
  d.apply(r6.events, r6.snapshot);
  fx.onEvents(r6.events, r6.snapshot, d);
  const tono = d.bubbles.find((b) => b.id === "P-001")?.bubble;
  assert.ok(tono && PHRASES.wake.includes(tono.text), "Toño habla al despertar");
  let doctorText = null;
  step(d, fx, {
    seconds: 15,
    until: () => {
      doctorText = d.bubbles.find((b) => b.id === "D-01")?.bubble.text ?? null;
      return doctorText !== null;
    },
  });
  assert.ok(PHRASES.doctor.includes(doctorText), `Karen responde: ${doctorText}`);
  assert.equal(tono.done, true);

  // Los globos se dibujan encima de los efectos (se repintan al final).
  step(d, fx, { seconds: 0.5 }); // que el globo del doctor ya tenga letras
  const ctx = fakeCtx({ width: 4000, height: 4000 });
  const cam = flatCamera({ viewW: 4000, viewH: 4000 });
  d.draw(ctx, cam, null);
  fx.drawEntityFx(ctx, cam, d);
  const lastText = ctx.calls.findLastIndex((c) => c[0] === "fillText");
  const lastRestore = ctx.calls.findLastIndex((c) => c[0] === "restore");
  assert.ok(lastText > 0 && ctx.calls.slice(lastText).every((c) => c[0] !== "translate"), "globo al final");
  assert.ok(lastRestore > lastText);
  simulate(d, { seconds: 1 });
});

test("sonido: silenciado por defecto, sin crear AudioContext; con volumen sí suena", () => {
  let created = 0;
  const started = [];
  class FakeAudioContext {
    constructor() {
      created++;
      this.state = "running";
      this.currentTime = 0;
      this.destination = {};
    }
    createGain() {
      return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} };
    }
    createOscillator() {
      return {
        type: "",
        frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {},
        start: (t) => started.push(t),
        stop() {},
      };
    }
    createBiquadFilter() {
      return { type: "", frequency: { value: 0 }, connect() {} };
    }
    close() {}
  }

  const muted = createAudio({ AudioCtx: FakeAudioContext });
  assert.equal(muted.volume, 0);
  assert.equal(muted.beep(), false);
  assert.equal(muted.snore(), false);
  assert.equal(muted.siren(), false);
  assert.equal(created, 0, "con volumen 0 no se crea nada");

  const loud = createAudio({ volume: 0.5, AudioCtx: FakeAudioContext });
  assert.equal(loud.beep(), true);
  assert.equal(loud.snore(), true);
  assert.equal(loud.siren(), true);
  assert.equal(created, 1, "un solo contexto");
  assert.ok(started.length >= 8);
  loud.setVolume(7);
  assert.equal(loud.volume, 1, "se limita a 0..1");
  loud.setVolume(-1);
  assert.equal(loud.beep(), false);
  loud.dispose();

  // Sin WebAudio (Node) no falla.
  const none = createAudio({ volume: 1, AudioCtx: undefined });
  assert.equal(none.beep(), false);
  const broken = createAudio({ volume: 1, AudioCtx: function Broken() { throw new Error("no"); } });
  assert.equal(broken.beep(), false);
});
