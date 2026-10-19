import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CREDITS } from "../js/scenes/credits.js";

const licenses = readFileSync(new URL("../assets/LICENSES.md", import.meta.url), "utf8");

test("créditos: secciones con título y entradas con nombre", () => {
  assert.ok(CREDITS.length >= 4);
  for (const s of CREDITS) {
    assert.ok(s.title, "sección sin título");
    assert.ok(s.items.length > 0, `${s.title}: sin entradas`);
    for (const it of s.items) assert.ok(it.name, `${s.title}: entrada sin nombre`);
  }
});

test("créditos: todo el arte de terceros está en LICENSES.md, con licencia y enlace", () => {
  const thirdParty = CREDITS.find((s) => s.title === "Arte de terceros").items;
  for (const it of thirdParty) {
    assert.ok(it.license && it.url, `${it.name}: falta licencia o enlace`);
    assert.ok(licenses.includes(it.name), `${it.name} no aparece en LICENSES.md`);
    assert.ok(licenses.includes(it.url), `${it.url} no aparece en LICENSES.md`);
  }
});
