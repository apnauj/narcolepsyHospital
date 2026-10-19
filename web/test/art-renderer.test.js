// Tests de SpriteRenderer con un contexto 2D falso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SpriteRenderer, FOOT_DY } from "../js/art/spriteRenderer.js";
import { appearanceFor, layersFor, staffAppearanceFor } from "../js/art/layers.js";
import { characterFrame, objectFor } from "../js/art/sheets.js";
import { fakeArt, fakeCtx, entity, manifest } from "./art-fixtures.js";

const art = fakeArt();
const shadowPath = manifest.shadow.sheet;

test("un paciente dibuja la sombra y sus capas, en orden", () => {
  const r = new SpriteRenderer(art);
  const ctx = fakeCtx();
  r.drawEntity(ctx, entity({ anim: "idle" }), 100, 50);
  const expected = layersFor(appearanceFor("P-1", art), art).map((l) => l.sheet);
  assert.deepEqual(ctx.calls.map((c) => c.path), [shadowPath, ...expected]);
  assert.equal(ctx.calls[0].alpha, 0.35, "la sombra es semitransparente");
  assert.equal(ctx.imageSmoothingEnabled, false);
  // Los pies (ancla) quedan en el centro del tile + FOOT_DY.
  const body = ctx.calls[1];
  assert.equal(body.dx + art.characters.anchor.x, 100);
  assert.equal(body.dy + art.characters.anchor.y, 50 + FOOT_DY);
  assert.ok(Number.isInteger(body.dx) && Number.isInteger(body.dy));
});

test("el personal usa su preset y el doctor raro lleva vueltiao", () => {
  const r = new SpriteRenderer(art);
  let found = false;
  for (let i = 0; i < 200 && !found; i++) {
    const id = `D-${i}`;
    if (staffAppearanceFor("doctor", id, art).preset === "doctor-vueltiao") {
      const ctx = fakeCtx();
      r.drawEntity(ctx, entity({ kind: "doctor", id }), 10, 10);
      assert.ok(ctx.calls.some((c) => c.path.includes("head-vueltiao")));
      assert.ok(ctx.calls.some((c) => c.path.includes("torso-bata")));
      found = true;
    }
  }
  assert.ok(found, "no salió ningún doctor vueltiao en 200 IDs");
});

test("cambia de frame con animTime y respeta dir", () => {
  const r = new SpriteRenderer(art);
  const src = (e) => {
    const ctx = fakeCtx();
    r.drawEntity(ctx, e, 0, 0);
    return ctx.calls[1];
  };
  const a = src(entity({ anim: "walk", animTime: 0 }));
  const b = src(entity({ anim: "walk", animTime: 1 / 8 + 0.001 }));
  assert.notEqual(a.sx, b.sx);
  assert.equal(a.sy, b.sy);
  const want = characterFrame(art, "walk", "left", 0);
  const left = src(entity({ anim: "walk", dir: "left" }));
  assert.equal(left.sy, want.sy);
  assert.notEqual(left.sy, a.sy);
  // walk repite: tras 4 frames vuelve al primero.
  assert.equal(src(entity({ anim: "walk", animTime: 0.5 })).sx, a.sx);
});

test("el paciente dormido en una cama usa el ride de la cama", () => {
  const decor = { tx: 5, ty: 3, kind: "bed", dir: "right", under: 11 };
  const world = { decor: [decor] };
  const r = new SpriteRenderer(art, { world });
  const bed = objectFor(art, decor);
  const ctx = fakeCtx();
  // Centro de la cama: cabecera (5,3) y pies a la derecha.
  r.drawEntity(ctx, entity({ anim: "sleep" }), 5 * 16 + 16, 3 * 16 + 8);
  assert.ok(!ctx.calls.some((c) => c.path === shadowPath), "en cama no hay sombra");
  const c = ctx.calls[0];
  assert.equal(c.m.tx, decor.tx * 16 - bed.origin.x + bed.ride.x);
  assert.equal(c.m.ty, decor.ty * 16 - bed.origin.y + bed.ride.y);
  // bed:left refleja al paciente.
  const left = { tx: 8, ty: 3, kind: "bed", dir: "left" };
  r.setWorld({ decor: [left] });
  const ctx2 = fakeCtx();
  r.drawEntity(ctx2, entity({ anim: "sleep" }), 8 * 16, 3 * 16 + 8);
  assert.equal(ctx2.calls[0].m.sx, -1);
  // Una cama de pie vertical gira 90 grados.
  r.setWorld({ decor: [{ tx: 2, ty: 2, kind: "bed", dir: "down" }] });
  const ctx3 = fakeCtx();
  r.drawEntity(ctx3, entity({ anim: "sleep" }), 2 * 16 + 8, 2 * 16 + 16);
  assert.ok(Math.abs(ctx3.calls[0].m.rot - Math.PI / 2) < 1e-9);
});

test("el robot dibuja su hoja sin sirena y el paciente cargado va sobre su ride", () => {
  const r = new SpriteRenderer(art);
  const ctx = fakeCtx();
  const robot = entity({ kind: "robot", id: "R-1", carrying: "P-1", anim: "walk" });
  r.drawEntity(ctx, robot, 64, 40);
  assert.deepEqual(ctx.calls.map((c) => c.path), [shadowPath, manifest.robot.sheet]);
  const rb = ctx.calls[1];
  // Con carga, el paciente (misma posición) se dibuja encima con el ride del robot.
  const ctx2 = fakeCtx();
  r.drawEntity(ctx2, entity({ anim: "stretcher", carriedBy: "R-1" }), 64, 40);
  assert.ok(!ctx2.calls.some((c) => c.path === manifest.stretcher.sheet), "no hay camilla aparte sobre el robot");
  assert.equal(ctx2.calls[0].m.tx, rb.dx + manifest.robot.ride.x);
  assert.equal(ctx2.calls[0].m.ty, rb.dy + manifest.robot.ride.y);
});

test("el paciente cargado por un camillero lleva su camilla", () => {
  const r = new SpriteRenderer(art);
  const ctx = fakeCtx();
  r.drawEntity(ctx, entity({ anim: "stretcher", carriedBy: "O-1" }), 30, 30);
  const paths = ctx.calls.map((c) => c.path);
  assert.ok(paths.includes(manifest.stretcher.sheet));
  assert.ok(paths.indexOf(manifest.stretcher.sheet) < paths.findIndex((p) => p.includes("skin-")));
});

test("no dibuja efectos: ni emote de alerta ni sirena", () => {
  const r = new SpriteRenderer(art);
  const ctx = fakeCtx();
  r.drawEntity(ctx, entity({ anim: "sleep", flags: { alert: true } }), 20, 20);
  assert.ok(!ctx.calls.some((c) => c.path === manifest.emotes.sheet));
});

test("el retrato se cachea por id y es null sin canvas", () => {
  const made = [];
  const r = new SpriteRenderer(art, {
    createCanvas: (w, h) => {
      const ctx = fakeCtx();
      const c = { w, h, ctx, getContext: () => ctx };
      made.push(c);
      return c;
    },
  });
  const p = r.portrait("patient", "P-9");
  assert.equal(r.portrait("patient", "P-9"), p);
  assert.equal(made.length, 1);
  assert.ok(made[0].ctx.calls.length >= 2);
  assert.equal(new SpriteRenderer(art, { createCanvas: () => null }).portrait("patient", "x"), null);
});
