import { test } from "node:test";
import assert from "node:assert/strict";
import { Typewriter } from "../js/ui/typewriter.js";
import { wrapText, pickPhrase } from "../js/ui/bubble.js";

test("el texto aparece letra por letra y las líneas van en orden", () => {
  // cps 4 y pasos de 0.5 s: 2 letras exactas por tick (sin errores de coma flotante).
  const tw = new Typewriter({ cps: 4 });
  tw.push("Hola");
  tw.push("Chao");
  assert.deepEqual(tw.visible(), [""]);
  tw.tick(0.5);
  assert.deepEqual(tw.visible(), ["Ho"]);
  tw.tick(0.5);
  assert.deepEqual(tw.visible(), ["Hola"]);
  tw.tick(0.5); // la siguiente línea empieza sin gastar tiempo
  assert.deepEqual(tw.visible(), ["Hola", "Ch"]);
  tw.tick(10);
  assert.deepEqual(tw.visible(), ["Hola", "Chao"]);
  assert.equal(tw.typing, false);
});

test("respeta el máximo de líneas", () => {
  const tw = new Typewriter({ cps: 1000, maxLines: 3 });
  for (let i = 0; i < 6; i++) tw.push(`l${i}`);
  tw.tick(1);
  assert.deepEqual(tw.visible(), ["l3", "l4", "l5"]);
});

test("con muchas líneas en espera completa la actual de golpe", () => {
  const tw = new Typewriter({ cps: 1, rush: 1 });
  for (const t of ["aaaa", "bbbb", "cccc"]) tw.push(t);
  tw.tick(0.01);
  assert.equal(tw.visible()[0], "aaaa");
});

test("globo: partir texto y elegir frase", () => {
  assert.deepEqual(wrapText("¡Joe, mani! ¿Qué pasó aquí?", 12), ["¡Joe, mani!", "¿Qué pasó", "aquí?"]);
  assert.equal(pickPhrase({ wake: ["a", "b"] }, "wake", () => 0.6), "b");
  assert.equal(pickPhrase({}, "wake"), "");
});
