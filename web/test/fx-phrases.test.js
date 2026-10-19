// data/phrases.json y pickPhrase: JSON válido, frases originales intactas,
// nada de estereotipos y sin repetir la misma frase dos veces seguidas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { pickPhrase, wrapText } from "../js/ui/bubble.js";
import { seededRng } from "./entities-fixtures.js";

const PHRASES = JSON.parse(readFileSync(new URL("../data/phrases.json", import.meta.url), "utf8"));

const ORIGINAL = {
  wake: [
    "¡Joe, mani! ¿Qué pasó aquí?",
    "Ajá, ¿y dónde estoy yo?",
    "¡Erda! Me privé otra vez.",
    "Ombe, qué sueñito tan bueno.",
    "¡Eche! ¿Y esta camilla de quién es?",
    "Cógela suave, doctor, que yo estoy bien.",
    "Primo, ¿ya ganó el Junior?",
    "Ñerda, se me fue la pálida.",
  ],
  doctor: ["Tranquilo, llave, ya pasó.", "Ajá, ve, camina con cuidado."],
};

test("phrases.json es válido: listas de frases no vacías y sin repetidas", () => {
  for (const kind of ["wake", "doctor", "attack", "again"]) {
    const list = PHRASES[kind];
    assert.ok(Array.isArray(list) && list.length > 0, kind);
    assert.equal(new Set(list).size, list.length, `${kind} sin repetidas`);
    for (const p of list) {
      assert.equal(typeof p, "string");
      assert.equal(p, p.trim(), `sin espacios sobrantes: «${p}»`);
      assert.ok(p.length > 0 && p.length <= 60, `corta: «${p}»`);
      assert.ok(wrapText(p).length <= 3, `cabe en el globo: «${p}»`);
    }
  }
  assert.ok(PHRASES.wake.length >= 20 && PHRASES.doctor.length >= 8 && PHRASES.attack.length >= 8);
  assert.ok(PHRASES.again.includes("¡Ombe, otra vez!"));
});

test("se conservan las frases que ya existían", () => {
  for (const [kind, list] of Object.entries(ORIGINAL)) {
    for (const p of list) assert.ok(PHRASES[kind].includes(p), `${kind}: «${p}»`);
  }
});

test("el humor es cultural, nunca el estereotipo del costeño perezoso ni groserías", () => {
  const all = Object.values(PHRASES).flat().join(" ").toLowerCase();
  for (const word of ["perez", "flojo", "floja", "vago", "vaga", "mamar", "mondá", "verga", "hijueputa", "marica", "huevón", "güevón"]) {
    assert.ok(!all.includes(word), `sin «${word}»`);
  }
  // Y sí sale lo cultural.
  for (const word of ["junior", "sancocho", "rimax", "vueltiao", "carnaval"]) assert.ok(all.includes(word), word);
  // Las de ataque quedan a medias: se duermen antes de terminar.
  for (const p of PHRASES.attack) assert.ok(/…/.test(p), `«${p}» queda a medias`);
});

test("pickPhrase no repite la misma frase dos veces seguidas", () => {
  for (const rng of [Math.random, seededRng(1), seededRng(42), () => 0, () => 0.999999]) {
    const phrases = JSON.parse(JSON.stringify(PHRASES)); // memoria aparte por objeto
    for (const kind of ["wake", "doctor", "attack"]) {
      let prev = null;
      const seen = new Set();
      for (let i = 0; i < 300; i++) {
        const p = pickPhrase(phrases, kind, rng);
        assert.ok(phrases[kind].includes(p));
        assert.notEqual(p, prev, `${kind} repetida en ${i}`);
        prev = p;
        seen.add(p);
      }
      if (rng === Math.random) assert.equal(seen.size, phrases[kind].length, `${kind}: salen todas`);
    }
  }
});

test("pickPhrase: una sola frase, listas vacías y datos raros", () => {
  const one = { again: ["¡Ombe, otra vez!"] };
  assert.equal(pickPhrase(one, "again"), "¡Ombe, otra vez!");
  assert.equal(pickPhrase(one, "again"), "¡Ombe, otra vez!", "con una sola, se repite");
  assert.equal(pickPhrase({ wake: [] }, "wake"), "");
  assert.equal(pickPhrase({}, "wake"), "");
  assert.equal(pickPhrase(null, "wake"), "");
  assert.equal(pickPhrase({ wake: "no es lista" }, "wake"), "");
  // Llama a rng una sola vez por frase (el director usa un rng con semilla).
  let calls = 0;
  const rng = () => (calls++, 0.3);
  const ph = { wake: ["a", "b", "c"] };
  pickPhrase(ph, "wake", rng);
  pickPhrase(ph, "wake", rng);
  assert.equal(calls, 2);
});
