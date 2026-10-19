// Tests del arte: paleta, manifest y apariencias. Se corren con
//   cd web && node --test "test/*.test.js"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PALETTE, PALETTE_NAMES, color } from "../js/art/palette.js";
import {
  loadArt, makeArt, getArt, sheetPaths, animFrame, characterFrame, spriteFrame,
  objectFor, tileFor, emoteFrame,
} from "../js/art/sheets.js";
import { appearanceFor, staffAppearanceFor, layersFor, hash32 } from "../js/art/layers.js";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, "..");
const assets = join(webDir, "assets");
const manifest = JSON.parse(readFileSync(join(assets, "sprites.json"), "utf8"));

/** Ancho y alto de un PNG leyendo su cabecera IHDR. */
function pngSize(rel) {
  const buf = readFileSync(join(assets, rel));
  assert.equal(buf.toString("ascii", 12, 16), "IHDR", `${rel} no es PNG`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test("la paleta JS es la misma de tools/spritegen/palette.go y del manifest", () => {
  const goSrc = readFileSync(join(webDir, "..", "tools", "spritegen", "palette.go"), "utf8");
  const goEntries = [...goSrc.matchAll(/\{'(.)', "([^"]+)", "(#[0-9a-f]{6})"\}/g)];
  assert.equal(goEntries.length, 32);
  assert.deepEqual(PALETTE, goEntries.map((m) => m[3]));
  assert.deepEqual(PALETTE_NAMES, goEntries.map((m) => m[2]));
  assert.deepEqual(PALETTE, manifest.palette);
  assert.equal(color("rojo-junior"), "#d62839");
  assert.throws(() => color("fucsia"));
});

test("todas las hojas del manifest existen y los frames caben", () => {
  for (const p of sheetPaths(manifest)) assert.ok(existsSync(join(assets, p)), `falta ${p}`);
  const ch = manifest.characters;
  for (const layers of Object.values(ch.layers)) {
    for (const l of layers) {
      if (!l.sheet) continue;
      const { w, h } = pngSize(l.sheet);
      assert.equal(w, ch.columns * ch.frame.w, l.sheet);
      assert.equal(h, ch.rows.length * ch.frame.h, l.sheet);
    }
  }
  const sprites = { ...manifest.objects, robot: manifest.robot, stretcher: manifest.stretcher, shadow: manifest.shadow };
  for (const [k, e] of Object.entries(sprites)) {
    const { w, h } = pngSize(e.sheet);
    assert.ok(e.frames >= 1, k);
    assert.ok(e.x + e.frames * e.frame.w <= w && e.y + e.frame.h <= h, `${k} no cabe en su hoja`);
    assert.ok(e.anchor || e.origin, `${k} sin anchor ni origin`);
  }
  const t = pngSize(manifest.tiles.sheet);
  for (const [k, e] of Object.entries(manifest.tiles.tiles)) {
    assert.ok(e.x + e.frames * manifest.tiles.size <= t.w && e.y + manifest.tiles.size <= t.h, `tile ${k}`);
  }
  for (const name of Object.values(manifest.tiles.byType)) assert.ok(manifest.tiles.tiles[name], name);
  const em = pngSize(manifest.emotes.sheet);
  assert.equal(em.w, manifest.emotes.count * manifest.emotes.frame.w);
});

test("las animaciones apuntan a filas que existen, por dirección", () => {
  const ch = manifest.characters;
  const needed = ["idle", "walk", "attack", "sleep", "stretcher", "attend", "wake", "push"];
  for (const name of needed) {
    const a = ch.animations[name];
    assert.ok(a, `falta ${name}`);
    for (const dir of ["down", "up", "left", "right"]) {
      const row = a.rows[dir];
      assert.ok(row >= 0 && row < ch.rows.length, `${name}/${dir}`);
      assert.equal(ch.rows[row].anim, name);
      assert.equal(ch.rows[row].frames, a.frames);
    }
    assert.ok(a.frames >= 1 && a.frames <= ch.columns);
  }
});

test("appearanceFor es determinista y queda dentro de los pools", () => {
  const art = makeArt(manifest);
  const seen = { skin: new Set(), torso: new Set(), head: new Set(), accessory: new Set() };
  for (let i = 1; i <= 300; i++) {
    const id = `P-${String(i).padStart(3, "0")}`;
    const a = appearanceFor(id, art);
    assert.deepEqual(a, appearanceFor(id, art), "mismo ID, misma apariencia");
    for (const cat of art.characters.layerOrder) {
      assert.ok(Number.isInteger(a[cat]));
      assert.ok(a[cat] >= 0 && a[cat] < art.characters.layers[cat].length, `${cat} fuera de rango`);
      assert.ok(art.characters.patientPools[cat].includes(a[cat]), `${cat} fuera del pool de pacientes`);
      seen[cat].add(a[cat]);
    }
    for (const l of layersFor(a, art)) assert.ok(l.sheet);
  }
  // Con 300 IDs salen casi todas las opciones de cada categoría.
  for (const cat of Object.keys(seen)) {
    assert.equal(seen[cat].size, new Set(art.characters.patientPools[cat]).size, `${cat}: no salieron todas`);
  }
});

test("el personal usa sus presets; el doctor del vueltiao existe pero es raro", () => {
  const art = makeArt(manifest);
  let vueltiao = 0;
  const vueltiaoIdx = art.characters.layers.head.findIndex((l) => l.id === "vueltiao");
  for (let i = 1; i <= 200; i++) {
    const id = `D-${String(i).padStart(2, "0")}`;
    const a = staffAppearanceFor("doctor", id, art);
    assert.deepEqual(a, staffAppearanceFor("doctor", id, art));
    assert.equal(art.characters.layers.torso[a.torso].id, "bata");
    if (a.head === vueltiaoIdx) vueltiao++;
  }
  assert.ok(vueltiao > 0 && vueltiao < 30, `vueltiao salió ${vueltiao} de 200`);
  const o = staffAppearanceFor("orderly", "O-01", art);
  assert.match(art.characters.layers.torso[o.torso].id, /^quirurgico-/);
  assert.ok(staffAppearanceFor("desconocido", "X", art).preset.startsWith("otro-"));
});

test("hash32 es FNV-1a estable", () => {
  assert.equal(hash32(""), 0x811c9dc5);
  assert.equal(hash32("a"), 0xe40c292c);
});

test("loadArt carga el manifest y todas las imágenes, y queda como arte actual", async () => {
  const loaded = [];
  const art = await loadArt({
    base: "assets/",
    fetchJSON: async (url) => JSON.parse(readFileSync(join(webDir, url), "utf8")),
    loadImage: async (url) => {
      assert.ok(existsSync(join(webDir, url)), url);
      loaded.push(url);
      return { url };
    },
  });
  assert.equal(getArt(), art);
  assert.equal(new Set(loaded).size, sheetPaths(manifest).length);
  assert.ok(art.characters.layers.skin[0].image);
  assert.ok(art.objects.chair.image && art.tiles.image && art.emotes.image && art.robot.image);
  // Sin pasar art usa el actual.
  assert.deepEqual(appearanceFor("P-001"), appearanceFor("P-001", art));
});

test("ayudas de frames y búsqueda de sprites", () => {
  const art = makeArt(manifest);
  const fw = manifest.characters.frame.w;
  const walkLeft = characterFrame(art, "walk", "left", 2);
  assert.deepEqual(walkLeft, { sx: 2 * fw, sy: manifest.characters.animations.walk.rows.left * manifest.characters.frame.h, sw: fw, sh: manifest.characters.frame.h });
  assert.notEqual(characterFrame(art, "sleep", "up", 0).sy, characterFrame(art, "sleep", "down", 0).sy);
  assert.equal(characterFrame(art, "wake", "up", 0).sy, characterFrame(art, "wake", "down", 0).sy);
  assert.equal(animFrame(art, "walk", 0), 0);
  const walk = manifest.characters.animations.walk;
  assert.equal(animFrame(art, "walk", (walk.frames + 1) / walk.fps), 1);
  assert.equal(animFrame(art, "attack", 999), manifest.characters.animations.attack.frames - 1);

  assert.equal(objectFor(art, { kind: "bed", dir: "down" }), art.objects["bed:down"]);
  assert.equal(objectFor(art, { kind: "table", w: 2 }), art.objects["table@2x1"]);
  assert.equal(objectFor(art, { kind: "counter", w: 5 }), art.objects.counter);
  assert.equal(objectFor(art, { kind: "nada" }), null);
  assert.deepEqual(spriteFrame(art.robot, 1), { sx: art.robot.frame.w, sy: 0, sw: art.robot.frame.w, sh: art.robot.frame.h });

  assert.equal(tileFor(art, "FLOOR").name, "piso");
  assert.equal(tileFor(art, "grama").name, "grama");
  assert.equal(tileFor(art, "NADA"), null);
  assert.equal(emoteFrame(art, "alert").sx, manifest.emotes.names.alert * 16);
  assert.throws(() => emoteFrame(art, "nada"));
});

test("la camiseta de la Selección sale en 1 de cada 5 pacientes, determinista por ID", () => {
  const art = makeArt(manifest);
  const sel = art.characters.layers.torso.findIndex((l) => l.id === "seleccion");
  assert.ok(sel >= 0);
  assert.ok(art.characters.layers.torso[sel].sheet);
  let n = 0;
  const total = 2000;
  for (let i = 0; i < total; i++) {
    const a = appearanceFor(`P-${i}`, art);
    if (a.torso === sel) n++;
    assert.equal(appearanceFor(`P-${i}`, art).torso, a.torso);
  }
  assert.ok(n / total > 0.15 && n / total < 0.25, `proporción ${n / total}`);
});
