import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as api from "../js/api.js";

let calls;
let reply;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  reply = { status: 200, body: { ok: true } };
  globalThis.fetch = async (path, init) => {
    calls.push({ path, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => {
        if (reply.body === undefined) throw new SyntaxError("no JSON");
        return reply.body;
      },
    };
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("cada endpoint usa el método, la ruta y el cuerpo del contrato", async () => {
  await api.getState();
  await api.getLocations();
  await api.getQueries();
  await api.reset({ rooms: 4, doctors: 2, orderlies: 1, patients: 6, robots: 3, speed: 2, showQueues: true });
  await api.addPatient();
  await api.addStaff("orderly");
  await api.attack("P-001", 34);
  await api.wakeUp("P-001");
  await api.scenarioStart();
  await api.scenarioNext();
  assert.deepEqual(calls, [
    { path: "/api/state", method: "GET", body: undefined },
    { path: "/api/locations", method: "GET", body: undefined },
    { path: "/api/queries", method: "GET", body: undefined },
    { path: "/api/reset", method: "POST", body: { rooms: 4, doctors: 2, orderlies: 1, patients: 6 } },
    { path: "/api/patients", method: "POST", body: {} },
    { path: "/api/staff", method: "POST", body: { kind: "orderly" } },
    { path: "/api/attacks", method: "POST", body: { patient: "P-001", location: 34 } },
    { path: "/api/wakeups", method: "POST", body: { patient: "P-001" } },
    { path: "/api/scenario/start", method: "POST", body: {} },
    { path: "/api/scenario/next", method: "POST", body: {} },
  ]);
});

test("un error HTTP se lanza con el mensaje de {error} y el código", async () => {
  reply = { status: 409, body: { error: "el paciente ya está dormido" } };
  await assert.rejects(api.wakeUp("P-001"), (err) => err.message === "el paciente ya está dormido" && err.status === 409);
});

test("un error sin JSON usa el código HTTP", async () => {
  reply = { status: 502, body: undefined };
  await assert.rejects(api.getState(), { message: "HTTP 502" });
});

test("sin conexión da un error legible", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(api.getState(), { message: "No hay conexión con el servidor." });
});
