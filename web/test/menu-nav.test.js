import { test } from "node:test";
import assert from "node:assert/strict";
import { menuNav, HOSPITAL_NAME } from "../js/scenes/menu.js";

test("flechas mueven la selección y dan la vuelta", () => {
  assert.equal(menuNav(0, "ArrowDown", 3), 1);
  assert.equal(menuNav(2, "ArrowDown", 3), 0);
  assert.equal(menuNav(0, "ArrowUp", 3), 2);
  assert.equal(menuNav(2, "ArrowUp", 3), 1);
  assert.equal(menuNav(1, "ArrowRight", 3), 2);
  assert.equal(menuNav(1, "ArrowLeft", 3), 0);
});

test("sin selección: abajo va al primero, arriba al último; Home y End", () => {
  assert.equal(menuNav(-1, "ArrowDown", 3), 0);
  assert.equal(menuNav(-1, "ArrowUp", 3), 2);
  assert.equal(menuNav(1, "Home", 3), 0);
  assert.equal(menuNav(1, "End", 3), 2);
});

test("otras teclas o lista vacía no navegan", () => {
  assert.equal(menuNav(0, "Enter", 3), null);
  assert.equal(menuNav(0, "a", 3), null);
  assert.equal(menuNav(0, "ArrowDown", 0), null);
});

test("el nombre del hospital es el exacto", () => {
  assert.equal(HOSPITAL_NAME, "Hospital de los Costeños con Narcolepsia");
});
