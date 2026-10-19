// Globo de diálogo (ui/bubble.js): tiempos, letra por letra y que nunca se
// salga de la pantalla de 384×216.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Bubble, bubbleDuration, layoutBubble, wrapText, TYPE_CPS, MARGIN, TAIL,
} from "../js/ui/bubble.js";
import { callsOf, fakeCtx } from "./fx-fixtures.js";

const W = 384;
const H = 216;

test("la duración crece con la longitud: escribir más un rato para leer", () => {
  const short = bubbleDuration("¡Erda!");
  const long = bubbleDuration("Me soñé bailando cumbia en la Batalla de Flores.");
  assert.ok(short >= 2 && short < long);
  assert.ok(long <= 48 / TYPE_CPS + 5 + 1e-9, "tope de lectura de 5 s");
  // El tiempo de lectura nunca baja de 2 s.
  assert.ok(bubbleDuration("") >= 2);
  // Sin duration la calcula; con duration la respeta (compatibilidad).
  assert.equal(new Bubble("Hola, primo", 0, 0).duration, bubbleDuration("Hola, primo"));
  assert.equal(new Bubble("Hola, primo", 0, 0, { duration: 3 }).duration, 3);
});

test("letra por letra: typing, shown, visibleLines, done y close", () => {
  const b = new Bubble("Ajá, ¿y dónde estoy yo?", 100, 100);
  assert.equal(b.shown, 0);
  assert.equal(b.typing, true);
  b.update(0.1);
  assert.equal(b.shown, 3);
  assert.deepEqual(b.visibleLines(), ["Ajá"]);
  b.update(b.total / TYPE_CPS);
  assert.equal(b.typing, false);
  assert.deepEqual(b.visibleLines(), b.lines);
  assert.equal(b.done, false, "se queda un rato para leerlo");
  b.update(-5); // dt inválido no retrocede
  b.update(Number.NaN);
  b.close();
  assert.equal(b.done, true);
});

test("dibuja el texto que va saliendo y, al final, la frase completa", () => {
  const b = new Bubble("¡Erda!", 100, 100);
  b.update(0.1);
  const ctx = fakeCtx();
  b.draw(ctx);
  assert.deepEqual(callsOf(ctx, "fillText").map((c) => c[1]), ["¡Er"]);
  b.update(1);
  const ctx2 = fakeCtx();
  b.draw(ctx2);
  assert.deepEqual(callsOf(ctx2, "fillText").map((c) => c[1]), ["¡Erda!"]);
  assert.ok(ctx2.calls.some((c) => c[0] === "set:font" && /PixelFont/.test(c[1])), "fuente pixel");
  b.close();
  const ctx3 = fakeCtx();
  b.draw(ctx3);
  assert.equal(ctx3.calls.length, 0, "terminado no dibuja");
});

test("wrapText no corta palabras, salvo las que no caben en una línea", () => {
  assert.deepEqual(wrapText("Primo, ¿ya ganó el Junior?", 12), ["Primo, ¿ya", "ganó el", "Junior?"]);
  assert.deepEqual(wrapText("supercalifragilístico", 8), ["supercal", "ifragilí", "stico"]);
  assert.deepEqual(wrapText("  ", 8), []);
  for (const line of wrapText("Me soñé de reina del carnaval, ¡con todo y corona!")) assert.ok([...line].length <= 22);
});

test("la caja nunca se sale de la pantalla, ni con quien habla en los bordes", () => {
  for (const x of [-60, 0, 1, 5, 50, 192, 330, 380, 383, 450]) {
    for (const y of [-40, 0, 3, 20, 40, 108, 200, 216, 300]) {
      for (const lines of [1, 2, 3, 4]) {
        for (const textW of [5, 60, 110, 500]) {
          const b = layoutBubble({ textW, lines, x, y });
          const where = `x=${x} y=${y} lines=${lines} w=${textW}`;
          assert.ok(b.left >= MARGIN && b.left + b.w <= W - MARGIN, `horizontal ${where}`);
          assert.ok(b.top >= MARGIN && b.top + b.h <= H - MARGIN, `vertical ${where}`);
          assert.ok(b.tipX > b.left && b.tipX < b.left + b.w, `flechita sobre la caja ${where}`);
          if (b.tail && !b.below) assert.ok(b.top + b.h + TAIL <= H, `flechita abajo ${where}`);
          if (b.tail && b.below) assert.ok(b.top - TAIL >= 0, `flechita arriba ${where}`);
          for (const v of [b.left, b.top, b.w, b.h, b.tipX]) assert.ok(Number.isInteger(v), `enteros ${where}`);
        }
      }
    }
  }
});

test("encima de la cabeza; si no cabe, debajo de los pies; la flechita apunta a quien habla", () => {
  const above = layoutBubble({ textW: 60, lines: 1, x: 200, y: 120 });
  assert.equal(above.below, false);
  assert.equal(above.top + above.h + TAIL, 120);
  assert.equal(above.tipX, 200);
  const under = layoutBubble({ textW: 60, lines: 2, x: 200, y: 10 });
  assert.equal(under.below, true);
  assert.ok(under.top > 10);
  // Contra el borde derecho la caja se corre, pero la flechita sigue a quien habla.
  const edge = layoutBubble({ textW: 100, lines: 1, x: 378, y: 120 });
  assert.equal(edge.left + edge.w, W - MARGIN);
  assert.ok(edge.tipX > edge.left + edge.w / 2);
});

test("todo lo que dibuja el globo queda dentro del canvas", () => {
  for (const [x, y] of [[0, 0], [383, 0], [0, 215], [383, 215], [192, 108], [-30, 400]]) {
    const b = new Bubble("Cógela suave, doctor, que yo estoy bien.", x, y);
    b.update(5);
    const ctx = fakeCtx();
    b.draw(ctx);
    for (const [, rx, ry, rw, rh] of callsOf(ctx, "fillRect")) {
      assert.ok(rx >= 0 && ry >= 0 && rx + rw <= W && ry + rh <= H, `(${x},${y}) -> rect ${rx},${ry},${rw},${rh}`);
    }
    for (const [, , tx, ty] of callsOf(ctx, "fillText")) assert.ok(tx >= 0 && ty >= 0 && tx < W && ty < H);
  }
});
