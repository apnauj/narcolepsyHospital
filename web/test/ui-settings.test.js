import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  STORAGE_KEY,
  loadConfig,
  normalizeConfig,
  saveConfig,
  validateConfig,
} from "../js/ui/settings.js";

test("la configuración por defecto es válida", () => {
  const r = validateConfig(DEFAULT_CONFIG);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, DEFAULT_CONFIG);
});

test("rangos del contrato en los bordes", () => {
  const base = { ...DEFAULT_CONFIG };
  for (const [field, min, max] of [
    ["rooms", 2, 10],
    ["doctors", 0, 6],
    ["orderlies", 0, 6],
    ["patients", 0, 12],
    ["robots", 1, 3],
  ]) {
    assert.equal(validateConfig({ ...base, [field]: min }).ok, true, `${field}=${min}`);
    assert.equal(validateConfig({ ...base, [field]: max }).ok, true, `${field}=${max}`);
    assert.ok(validateConfig({ ...base, [field]: min - 1 }).errors[field], `${field}=${min - 1}`);
    assert.ok(validateConfig({ ...base, [field]: max + 1 }).errors[field], `${field}=${max + 1}`);
  }
});

test("acepta números en texto (formulario) y rechaza decimales o vacío", () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, rooms: "7", speed: "4" });
  assert.equal(r.ok, true);
  assert.equal(r.value.rooms, 7);
  assert.equal(r.value.speed, 4);
  assert.ok(validateConfig({ ...DEFAULT_CONFIG, rooms: "2.5" }).errors.rooms);
  assert.ok(validateConfig({ ...DEFAULT_CONFIG, rooms: "" }).errors.rooms);
  assert.ok(validateConfig({ ...DEFAULT_CONFIG, rooms: "abc" }).errors.rooms);
});

test("doctores + camilleros debe ser al menos 1", () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, doctors: 0, orderlies: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.staff);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, doctors: 0, orderlies: 1 }).ok, true);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, doctors: 1, orderlies: 0 }).ok, true);
});

test("velocidad solo 1, 2 o 4", () => {
  assert.ok(validateConfig({ ...DEFAULT_CONFIG, speed: 3 }).errors.speed);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, speed: 2 }).ok, true);
});

test("normalizeConfig repara campo por campo", () => {
  const n = normalizeConfig({ rooms: 99, doctors: 0, orderlies: 0, patients: 3, robots: 3, speed: 2, showQueues: false });
  assert.equal(n.rooms, DEFAULT_CONFIG.rooms);
  assert.equal(n.patients, 3);
  assert.equal(n.robots, 3);
  assert.equal(n.speed, 2);
  assert.equal(n.showQueues, false);
  assert.ok(n.doctors + n.orderlies >= 1);
});

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data };
}

test("guardar y cargar con un storage", () => {
  const s = memoryStorage();
  const cfg = { ...DEFAULT_CONFIG, rooms: 9, speed: 4, showQueues: false };
  assert.equal(saveConfig(cfg, s), true);
  assert.deepEqual(loadConfig(s), cfg);
});

test("funciona sin storage, con storage que lanza y con JSON roto", () => {
  assert.deepEqual(loadConfig(null), DEFAULT_CONFIG);
  assert.equal(saveConfig(DEFAULT_CONFIG, null), false);
  const broken = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceeded");
    },
  };
  assert.deepEqual(loadConfig(broken), DEFAULT_CONFIG);
  assert.equal(saveConfig(DEFAULT_CONFIG, broken), false);
  const s = memoryStorage();
  s.setItem(STORAGE_KEY, "{no es json");
  assert.deepEqual(loadConfig(s), DEFAULT_CONFIG);
  // Sin argumento usa globalThis.localStorage, que en Node no existe.
  assert.deepEqual(loadConfig(), DEFAULT_CONFIG);
});

test("volumen: 0..1, silencio por defecto y compatible con configuraciones viejas", () => {
  assert.equal(DEFAULT_CONFIG.volume, 0, "silenciado por defecto");
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, volume: 0.5 }).value.volume, 0.5);
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, volume: "0.3" }).value.volume, 0.3, "texto del formulario");
  assert.equal(validateConfig({ ...DEFAULT_CONFIG, volume: 1 }).ok, true);
  assert.ok(validateConfig({ ...DEFAULT_CONFIG, volume: 1.5 }).errors.volume);
  assert.ok(validateConfig({ ...DEFAULT_CONFIG, volume: -0.1 }).errors.volume);
  assert.ok(validateConfig({ ...DEFAULT_CONFIG, volume: "fuerte" }).errors.volume);
  // Sin el campo (guardada antes de que existiera): silencio y válida.
  const { volume, ...old } = DEFAULT_CONFIG;
  assert.equal(volume, 0);
  const r = validateConfig(old);
  assert.equal(r.ok, true);
  assert.equal(r.value.volume, 0);
  // normalizeConfig repara un volumen roto y loadConfig lo conserva.
  assert.equal(normalizeConfig({ ...DEFAULT_CONFIG, volume: 9 }).volume, 0);
  const s = memoryStorage();
  saveConfig({ ...DEFAULT_CONFIG, volume: 0.7 }, s);
  assert.equal(loadConfig(s).volume, 0.7);
  s.setItem(STORAGE_KEY, JSON.stringify(old));
  assert.equal(loadConfig(s).volume, 0);
});
