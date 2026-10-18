import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeEvent,
  describeNotice,
  describeError,
  describeResult,
  inLocation,
  patientStateLabel,
} from "../js/ui/describe.js";
import { LOCATIONS, snapshot } from "./ui-fixtures.js";

const snap = snapshot();
const say = (event) => describeEvent(event, snap, LOCATIONS);

test("patientAdmitted", () => {
  assert.equal(say({ type: "patientAdmitted", patient: "P-005" }), "¡Nayeli Polo llegó al hospital!");
});

test("staffHired distingue doctor, camillero y otro", () => {
  assert.equal(say({ type: "staffHired", staff: "D-01" }), "¡Karen Ospina se unió al equipo médico!");
  assert.equal(say({ type: "staffHired", staff: "O-01" }), "¡Chucho Barraza se unió al equipo de camilleros!");
  const other = { ...snap, staff: [{ id: "X-01", name: "Rafa", kind: "other", busyWith: "" }] };
  assert.equal(describeEvent({ type: "staffHired", staff: "X-01" }, other, LOCATIONS), "¡Rafa se unió al personal!");
});

test("patientWoke con cama y personal liberados", () => {
  assert.equal(
    say({ type: "patientWoke", patient: "P-001", room: 101, staff: "D-01" }),
    "¡Toño Mendoza se despertó! La habitación 101 queda libre. Karen Ospina queda libre.",
  );
  assert.equal(say({ type: "patientWoke", patient: "P-005" }), "¡Nayeli Polo se despertó!");
});

test("attackStarted usa el nombre exacto de la Location", () => {
  assert.equal(
    say({ type: "attackStarted", patient: "P-004", location: 6 }),
    "¡A Wilfrido Berrío le dio un ataque de sueño en el Main Hallway!",
  );
  assert.equal(say({ type: "attackStarted", patient: "P-001", location: 34 }), "¡A Toño Mendoza le dio un ataque de sueño en la Cafeteria!");
});

test("roomAssigned directo y desde la cola", () => {
  assert.equal(say({ type: "roomAssigned", patient: "P-002", room: 102 }), "Llevan a Yeimy Padilla a la habitación 102.");
  assert.equal(
    say({ type: "roomAssigned", patient: "P-004", room: 101, fromQueue: true }),
    "¡Se liberó la habitación 101! Wilfrido Berrío sale de la cola y pasa a ella.",
  );
});

test("queuedForRoom y queuedForStaff dicen el puesto en la cola", () => {
  assert.equal(say({ type: "queuedForRoom", patient: "P-004" }), "Wilfrido Berrío espera en la Cola de Habitaciones (puesto 1).");
  assert.equal(say({ type: "queuedForStaff", patient: "P-004" }), "Wilfrido Berrío espera en la Cola de Atención (puesto 1).");
});

test("attentionAssigned directo y desde la cola", () => {
  assert.equal(say({ type: "attentionAssigned", patient: "P-001", staff: "D-01" }), "Karen Ospina atiende a Toño Mendoza.");
  assert.equal(
    say({ type: "attentionAssigned", patient: "P-004", staff: "D-01", fromQueue: true }),
    "¡Karen Ospina por fin atiende a Wilfrido Berrío, que esperaba en la cola!",
  );
});

test("IDs desconocidos y tipos nuevos no revientan", () => {
  assert.equal(say({ type: "patientAdmitted", patient: "P-099" }), "¡P-099 llegó al hospital!");
  assert.equal(say({ type: "attackStarted", patient: "P-005", location: 77 }), "¡A Nayeli Polo le dio un ataque de sueño en la zona 77!");
  assert.match(say({ type: "algoNuevo" }), /algoNuevo/);
});

test("avisos y errores", () => {
  assert.equal(describeNotice({ kind: "noRoom", message: "x" }), "No hay habitación libre: se queda en la cola.");
  assert.match(describeNotice({ kind: "noStaff", message: "x" }), /^No hay personal libre/);
  assert.equal(describeNotice({ kind: "otro", message: "hola" }), "hola");
  assert.equal(describeError(new Error("paciente ya dormido")), "¡Ups! Paciente ya dormido");
});

test("describeResult: eventos en orden y luego avisos", () => {
  const lines = describeResult(
    {
      snapshot: snap,
      events: [
        { type: "attackStarted", patient: "P-004", location: 6 },
        { type: "queuedForRoom", patient: "P-004" },
      ],
      notices: [{ kind: "noRoom", message: "" }],
    },
    LOCATIONS,
  );
  assert.equal(lines.length, 3);
  assert.match(lines[0], /ataque de sueño/);
  assert.match(lines[2], /^No hay habitación/);
});

test("etiquetas de estado e inLocation", () => {
  assert.equal(patientStateLabel("Asleep In Hallway"), "Dormido en el pasillo");
  assert.equal(inLocation(LOCATIONS, 35), "en el Administrative Block");
  assert.equal(inLocation(LOCATIONS, 1), "en la Main Entrance");
});
