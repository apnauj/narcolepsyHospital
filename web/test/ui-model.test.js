import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cardInfo,
  chooseAttackTarget,
  chooseScale,
  chooseWakeTarget,
  colorFromId,
  formatQueries,
  indicatorCounts,
  initials,
  locationIdByName,
  pickHallwayLocation,
  queueEntries,
  toolbarState,
} from "../js/ui/model.js";
import { LOCATIONS, snapshot } from "./ui-fixtures.js";

test("queueEntries respeta EXACTAMENTE el orden del snapshot", () => {
  const snap = snapshot();
  snap.roomQueue = ["P-005", "P-002", "P-004"];
  snap.staffQueue = ["P-003", "P-005"];
  const { room, staff } = queueEntries(snap);
  assert.deepEqual(room.map((e) => e.id), snap.roomQueue);
  assert.deepEqual(staff.map((e) => e.id), snap.staffQueue);
  assert.deepEqual(room.map((e) => e.position), [1, 2, 3]);
  assert.equal(room[0].inBoth, true); // P-005 está en las dos
  assert.equal(room[1].inBoth, false);
  assert.equal(room[2].name, "Wilfrido Berrío");
  assert.equal(room[2].initials, "WB");
});

test("queueEntries con colas vacías o snapshot nulo", () => {
  assert.deepEqual(queueEntries(null), { room: [], staff: [] });
  const snap = snapshot();
  snap.roomQueue = [];
  snap.staffQueue = [];
  assert.deepEqual(queueEntries(snap), { room: [], staff: [] });
});

test("retrato sin renderer: color estable por ID e iniciales", () => {
  assert.equal(colorFromId("P-001"), colorFromId("P-001"));
  assert.notEqual(colorFromId("P-001"), colorFromId("P-002"));
  assert.equal(initials("Kelly Johana Torres"), "KT");
  assert.equal(initials("Toño"), "TO");
  assert.equal(initials(""), "?");
});

test("indicadores", () => {
  const snap = snapshot();
  snap.rooms[2].occupants = [];
  const c = indicatorCounts(snap, { free: 1, total: 2 });
  assert.equal(c.roomsFree, 1);
  assert.equal(c.roomsBusy, 2);
  assert.equal(c.staffFree, 0);
  assert.equal(c.staffBusy, 3);
  assert.equal(c.patientsAsleep, 4);
  assert.equal(c.patientsAwake, 1);
  assert.equal(c.robotsFree, 1);
  assert.equal(c.robotsTotal, 2);
  assert.equal(indicatorCounts(snap, 3).robotsFree, 3);
});

const sel = (id) => ({ kind: "patient", id });

test("botones en modo libre según el paciente seleccionado", () => {
  const snapshotFree = { ...snapshot(), mode: "free" };
  const none = toolbarState({ mode: "free", snapshot: snapshotFree, selection: null });
  assert.equal(none.addPatient, true);
  assert.equal(none.addDoctor, true);
  assert.equal(none.addOrderly, true);
  assert.equal(none.attack, true); // hay alguien despierto (P-005)
  assert.equal(none.wakeUp, true); // avisa en el registro que falta selección
  assert.equal(none.next, false);

  const awake = toolbarState({ mode: "free", snapshot: snapshotFree, selection: sel("P-005") });
  assert.equal(awake.attack, true);
  assert.equal(awake.wakeUp, false);

  const asleep = toolbarState({ mode: "free", snapshot: snapshotFree, selection: sel("P-004") });
  assert.equal(asleep.attack, false);
  assert.equal(asleep.wakeUp, true);

  // Seleccionar personal no cuenta como paciente.
  const staff = toolbarState({ mode: "free", snapshot: snapshotFree, selection: { kind: "doctor", id: "D-01" } });
  assert.equal(staff.attack, true);
});

test("sin nadie despierto no hay ataque al azar", () => {
  const snap = snapshot();
  snap.patients = snap.patients.filter((p) => p.asleep);
  assert.equal(toolbarState({ mode: "free", snapshot: snap, selection: null }).attack, false);
});

test("límites de 30 pacientes y 12 de personal", () => {
  const snap = snapshot();
  snap.patients = Array.from({ length: 30 }, (_, i) => ({ id: `P-${i}`, name: "x", asleep: false }));
  snap.staff = Array.from({ length: 12 }, (_, i) => ({ id: `D-${i}`, name: "y", kind: "doctor", busyWith: "" }));
  const s = toolbarState({ mode: "free", snapshot: snap, selection: null });
  assert.equal(s.addPatient, false);
  assert.equal(s.addDoctor, false);
  assert.equal(s.addOrderly, false);
});

test("modo escenario: manuales apagados, «Siguiente paso» hasta terminar", () => {
  const s = toolbarState({ mode: "scenario", snapshot: snapshot(), selection: sel("P-005") });
  for (const key of ["addPatient", "addDoctor", "addOrderly", "attack", "wakeUp"]) assert.equal(s[key], false, key);
  assert.equal(s.next, true);
  assert.equal(s.queries, false);
  assert.equal(s.pause, true);
  assert.equal(s.speed, true);
  const done = toolbarState({ mode: "scenario", snapshot: snapshot(), selection: null, done: true });
  assert.equal(done.next, false);
  assert.equal(done.queries, true);
});

test("mientras hay una petición en curso todo comando se apaga", () => {
  const free = toolbarState({ mode: "free", snapshot: snapshot(), selection: null, busy: true });
  assert.equal(free.addPatient, false);
  assert.equal(free.attack, false);
  const sc = toolbarState({ mode: "scenario", snapshot: snapshot(), selection: null, busy: true });
  assert.equal(sc.next, false);
  assert.equal(toolbarState({ mode: "free", snapshot: null, selection: null }).addPatient, false);
});

test("objetivos de Ataque y Despertar", () => {
  const snap = snapshot();
  assert.equal(chooseAttackTarget(snap, sel("P-005")).patient.id, "P-005");
  assert.equal(chooseAttackTarget(snap, sel("P-004")).patient, null);
  assert.match(chooseAttackTarget(snap, sel("P-004")).reason, /ya está dormido/);
  assert.equal(chooseAttackTarget(snap, null, () => 0.99).patient.id, "P-005"); // único despierto
  assert.equal(chooseWakeTarget(snap, sel("P-001")).patient.id, "P-001");
  assert.equal(chooseWakeTarget(snap, sel("P-004")).patient.id, "P-004"); // dormido en el pasillo también
  assert.equal(chooseWakeTarget(snap, sel("P-005")).patient, null);
  assert.match(chooseWakeTarget(snap, null).reason, /Selecciona/);
});

test("ubicación del ataque: pasillos y nombres de zona", () => {
  const ids = new Set();
  for (let i = 0; i < 10; i++) ids.add(pickHallwayLocation(LOCATIONS, () => i / 10));
  assert.deepEqual([...ids].sort((a, b) => a - b), [6, 9, 13]);
  assert.equal(pickHallwayLocation([]), null);
  assert.equal(locationIdByName(LOCATIONS, "Cafeteria"), 34);
  assert.equal(locationIdByName(LOCATIONS, "Nada"), null);
});

test("ficha de paciente, de personal y de robot", () => {
  const snap = snapshot();
  const p = cardInfo(snap, sel("P-004"), "esperando");
  assert.equal(p.name, "Wilfrido Berrío");
  assert.match(p.role, /61 años/);
  assert.match(p.role, /severa/);
  assert.equal(p.state, "Dormido en el pasillo");
  assert.deepEqual(p.queues, ["Cola de Habitaciones (puesto 1)", "Cola de Atención (puesto 1)"]);
  assert.equal(p.visual, "esperando");
  const bed = cardInfo(snap, sel("P-001"));
  assert.equal(bed.state, "Dormido en cama (hab. 101); lo atiende Karen Ospina");
  assert.deepEqual(bed.queues, []);
  const d = cardInfo(snap, { kind: "doctor", id: "D-01" });
  assert.equal(d.role, "Doctor D-01");
  assert.equal(d.state, "Atendiendo a Toño Mendoza");
  assert.match(cardInfo(snap, { kind: "robot", id: "1" }).name, /robot/);
  assert.equal(cardInfo(snap, sel("P-404")), null);
  assert.equal(cardInfo(snap, null), null);
});

test("escala entera del canvas", () => {
  // 1280×800 con el panel lateral reservado: ×2.
  assert.equal(chooseScale(1280 - 360, 800 - 300), 2);
  assert.equal(chooseScale(1920 - 360, 1080 - 300), 3);
  assert.equal(chooseScale(300, 100), 1);
  assert.equal(chooseScale(5000, 5000, { max: 4 }), 4);
});

test("las 4 consultas del caso de prueba", () => {
  const snap = snapshot();
  const queries = {
    hallway: ["P-004"],
    episodes: [
      {
        doctor: "D-01",
        episodes: [{ id: "E-1", date: "", patient: "P-001", location: 34, room: 101, attender: "D-01", summary: "" }],
      },
      { doctor: "D-02", episodes: [] },
    ],
    severe: [
      { patient: "P-002", episodes: 1 },
      { patient: "P-004", episodes: 1 },
    ],
  };
  const notice = { kind: "noRoom", message: "no hay habitación disponible para P-004" };
  const s = formatQueries(queries, snap, LOCATIONS, [notice]);
  assert.deepEqual(s.map((x) => x.tag), ["[5.1]", "[5.2]", "[5.3]", "[5.4]"]);
  assert.deepEqual(s[0].lines, ["P-004 Wilfrido Berrío"]);
  assert.equal(s[1].lines[0], "D-01 Karen Ospina: 1 episodio(s)");
  assert.match(s[1].lines[1], /hab\. 101/);
  assert.deepEqual(s[2].lines, [notice.message]);
  assert.equal(s[3].lines[1], "P-004 Wilfrido Berrío: 1 episodio(s)");
  const empty = formatQueries({ hallway: [], episodes: [], severe: [] }, snap, LOCATIONS);
  assert.ok(empty.every((x) => x.lines.length > 0));
});
