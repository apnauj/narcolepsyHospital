// Hospital falso para los tests de entities y la página entities-preview.html.
//
// Imita lo que hacen hospital/ y api/ para producir Results realistas:
// camas por orden de número, personal por turnos (round-robin) saltándose a
// quien está ocupado, colas FIFO que se sirven al despertar (primero camas,
// luego personal) y los eventos de api.Diff en el orden del contrato
// (sección 4). No es la lógica real: solo sirve para alimentar al Director.

const clone = (v) => JSON.parse(JSON.stringify(v));

/** Locations numéricas que usa el escenario (valores de hospital.Location). */
export const LOC = Object.freeze({
  mainEntrance: 1,
  waitingRoom: 5,
  mainHallway: 6,
  eastHallway: 9,
  radiology: 30,
  cafeteria: 34,
});

export class FakeHospital {
  /**
   * @param {{ rooms?: number[], staff?: {id, name, kind}[], patients?: {id, name}[], mode?: string }} spec
   */
  constructor({ rooms = [101, 102, 103], staff = [], patients = [], mode = "free" } = {}) {
    this.mode = mode;
    this.rooms = rooms.map((number) => ({ number, capacity: 1, occupants: [] }));
    this.staff = staff.map((s) => ({ ...s }));
    this.patients = patients.map((p) => ({
      id: p.id, name: p.name ?? p.id, age: p.age ?? 40, level: p.level ?? "Moderate",
      asleep: false, location: 0, room: 0,
    }));
    this.attending = new Map(); // staffId -> patientId
    this.next = 0;
    this.roomQueue = [];
    this.staffQueue = [];
  }

  snapshot() {
    const attendedBy = (id) => [...this.attending].find(([, p]) => p === id)?.[0] ?? "";
    return clone({
      hospital: "Hospital de los Costeños con Narcolepsia",
      mode: this.mode,
      rooms: this.rooms.map((r) => ({ ...r, state: r.occupants.length ? "Occupied" : "Available" })),
      staff: this.staff.map((s) => ({ id: s.id, name: s.name, kind: s.kind, busyWith: this.attending.get(s.id) ?? "" })),
      patients: this.patients.map((p) => ({
        ...p,
        state: !p.asleep ? "Awake" : p.room ? "Asleep In Bed" : "Asleep In Hallway",
        attendedBy: p.asleep ? attendedBy(p.id) : "",
      })),
      roomQueue: this.roomQueue,
      staffQueue: this.staffQueue,
    });
  }

  // Ejecuta un comando y devuelve el Result con los eventos de Diff.
  run(fn) {
    const before = this.snapshot();
    const notices = [];
    fn(notices);
    const after = this.snapshot();
    return { snapshot: after, events: diff(before, after), notices };
  }

  patient(id) {
    const p = this.patients.find((q) => q.id === id);
    if (!p) throw new Error(`paciente desconocido ${id}`);
    return p;
  }

  admit(id, name = id) {
    return this.run(() => {
      this.patients.push({ id, name, age: 40, level: "Mild", asleep: false, location: 0, room: 0 });
    });
  }

  hire(id, kind, name = id) {
    return this.run(() => {
      this.staff.push({ id, name, kind });
      this.serveQueues();
    });
  }

  attack(id, location = LOC.mainHallway) {
    return this.run((notices) => {
      const p = this.patient(id);
      if (p.asleep) throw new Error(`${id} ya duerme`);
      p.asleep = true;
      p.location = location;
      if (!this.assignRoom(p)) {
        this.roomQueue.push(id);
        notices.push({ kind: "noRoom", message: `No hay habitación para ${id}` });
      }
      if (!this.dispatch(p)) {
        this.staffQueue.push(id);
        notices.push({ kind: "noStaff", message: `No hay personal para ${id}` });
      }
    });
  }

  /** El paso 5 del escenario: AssignRoom a alguien que sigue en el pasillo. */
  tryAssignRoom(id) {
    return this.run((notices) => {
      const p = this.patient(id);
      if (!this.assignRoom(p)) notices.push({ kind: "noRoom", message: `[5.3] No hay habitación para ${id}` });
    });
  }

  wake(id) {
    return this.run(() => {
      const p = this.patient(id);
      if (!p.asleep) throw new Error(`${id} no duerme`);
      p.asleep = false;
      p.location = 0;
      for (const r of this.rooms) r.occupants = r.occupants.filter((o) => o !== id);
      p.room = 0;
      this.roomQueue = this.roomQueue.filter((q) => q !== id);
      this.staffQueue = this.staffQueue.filter((q) => q !== id);
      for (const [s, q] of [...this.attending]) if (q === id) this.attending.delete(s);
      this.serveQueues();
    });
  }

  assignRoom(p) {
    if (!p.asleep || p.room) return false;
    const r = this.rooms.find((room) => room.occupants.length < room.capacity);
    if (!r) return false;
    r.occupants.push(p.id);
    p.room = r.number;
    this.roomQueue = this.roomQueue.filter((q) => q !== p.id);
    return true;
  }

  dispatch(p) {
    for (let i = 0; i < this.staff.length; i++) {
      const a = this.staff[this.next];
      this.next = (this.next + 1) % this.staff.length;
      if (this.attending.has(a.id)) continue;
      this.attending.set(a.id, p.id);
      return true;
    }
    return false;
  }

  serveQueues() {
    while (this.roomQueue.length && this.assignRoom(this.patient(this.roomQueue[0])));
    while (this.staffQueue.length && this.dispatch(this.patient(this.staffQueue[0]))) this.staffQueue.shift();
  }
}

/** Puerto a JS de api.Diff (api/events.go). */
export function diff(before, after) {
  const prev = new Map(before.patients.map((p) => [p.id, p]));
  const was = (id) => prev.get(id) ?? { asleep: false, room: 0, attendedBy: "" };
  const events = [];
  for (const p of after.patients) if (!prev.has(p.id)) events.push({ type: "patientAdmitted", patient: p.id });
  for (const s of after.staff) {
    if (!before.staff.some((b) => b.id === s.id)) events.push({ type: "staffHired", staff: s.id });
  }
  for (const p of after.patients) {
    const old = was(p.id);
    if (old.asleep && !p.asleep) events.push({ type: "patientWoke", patient: p.id, room: old.room, staff: old.attendedBy });
  }
  for (const p of after.patients) {
    if (!was(p.id).asleep && p.asleep) events.push({ type: "attackStarted", patient: p.id, location: p.location });
  }
  const assigned = (queue, ok, make) => {
    const byId = new Map(after.patients.map((p) => [p.id, p]));
    for (const id of queue) if (byId.has(id) && ok(byId.get(id))) events.push(make(byId.get(id), true));
    for (const p of after.patients) if (ok(p) && !queue.includes(p.id)) events.push(make(p, false));
  };
  const queued = (type, b, a) => {
    for (const id of a) if (!b.includes(id)) events.push({ type, patient: id });
  };
  assigned(before.roomQueue, (p) => p.asleep && p.room !== 0 && (was(p.id).room === 0 || !was(p.id).asleep),
    (p, fromQueue) => ({ type: "roomAssigned", patient: p.id, room: p.room, ...(fromQueue ? { fromQueue } : {}) }));
  queued("queuedForRoom", before.roomQueue, after.roomQueue);
  assigned(before.staffQueue, (p) => p.attendedBy !== "" && p.attendedBy !== was(p.id).attendedBy,
    (p, fromQueue) => ({ type: "attentionAssigned", patient: p.id, staff: p.attendedBy, ...(fromQueue ? { fromQueue } : {}) }));
  queued("queuedForStaff", before.staffQueue, after.staffQueue);
  return events;
}

/** El hospital del caso de prueba (demo.NewHospital): 2 doctores, 1 camillero, 3 camas, 5 pacientes. */
export function scenarioHospital() {
  return new FakeHospital({
    mode: "scenario",
    rooms: [101, 102, 103],
    staff: [
      { id: "D-01", name: "Karen Ospina", kind: "doctor" },
      { id: "D-02", name: "Álvaro Cassiani", kind: "doctor" },
      { id: "O-01", name: "Chucho Barraza", kind: "orderly" },
    ],
    patients: [
      { id: "P-001", name: "Toño Mendoza" },
      { id: "P-002", name: "Yeimy Padilla" },
      { id: "P-003", name: "Kelly Johana Torres" },
      { id: "P-004", name: "Wilfrido Berrío" },
      { id: "P-005", name: "Nayeli Polo" },
    ],
  });
}

/** Los 6 pasos del escenario (contrato, sección 2), como comandos sobre el hospital falso. */
export const SCENARIO_STEPS = Object.freeze([
  { title: "Ataque de P-001 en la cafetería", run: (h) => h.attack("P-001", LOC.cafeteria) },
  { title: "Ataque de P-002 en radiología", run: (h) => h.attack("P-002", LOC.radiology) },
  { title: "Ataque de P-003 en la sala de espera", run: (h) => h.attack("P-003", LOC.waitingRoom) },
  { title: "Ataque de P-004 en el pasillo principal", run: (h) => h.attack("P-004", LOC.mainHallway) },
  { title: "[5.3] Asignando habitación a P-004", run: (h) => h.tryAssignRoom("P-004") },
  { title: "P-001 Toño Mendoza se despierta", run: (h) => h.wake("P-001") },
]);

/** Generador pseudoaleatorio determinista (mulberry32). */
export function seededRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Avanza el director en pasos fijos hasta que `until()` sea true o se acabe el tope. Devuelve los segundos simulados. */
export function simulate(director, { seconds = 60, dt = 1 / 30, until = null } = {}) {
  let t = 0;
  while (t < seconds) {
    director.update(dt);
    t += dt;
    if (until && until()) return t;
  }
  return t;
}
