// Director: convierte los eventos de la API en animaciones sobre el mapa
// (contrato, sección 5, «web/js/entities/» y sus «Reglas visuales»).
//
// La lógica ya decidió todo; el director solo lo cuenta con entidades que
// caminan. Cómo funciona:
//   - Cada paciente tiene una cola FIFO de trabajos (uno por evento). Un
//     trabajo empieza cuando termina el anterior del mismo paciente, así que
//     un evento que llega a mitad de una animación espera su turno y nunca se
//     pierde. Los trabajos mandan tareas (tasks.js) al paciente, al personal
//     y a las camillas robot.
//   - El snapshot que acompaña a cada evento es la verdad: de ahí salen quién
//     atiende (attendedBy), su tipo (staff[].kind) y las colas (flags.alert).
//   - Cada medio segundo, a quien no tenga trabajos pendientes se le compara
//     con el último snapshot y, si quedó incoherente (eventos perdidos,
//     recargas...), se le encola el trabajo que lo lleva al estado correcto.
//
// Máquinas de estado visuales (Entity.state):
//   Paciente: Caminando -> Atacado -> Dormido (Esperando | SiendoAtendido)
//             -> EnTraslado -> Dormido -> Despertando -> Caminando
//   Doctor/Camillero: Patrullando -> YendoAlPaciente -> Transportando
//             | Atendiendo -> Patrullando
//   Robot: EnBase -> YendoAlPaciente -> Transportando -> RegresandoABase -> EnBase

import { findPath, zoneAt, roomAt, TILE } from "../world/index.js";
import { Bubble, pickPhrase } from "../ui/bubble.js";
import { Entity, manhattan, sameTile, tileCenter, tileKey } from "./entity.js";
import {
  runTasks, setTasks, isIdle,
  walkTo, waitUntil, hold, setState, call,
  pickUp, transportToBed, attend, returnToBase, wanderToPoi, patrol,
} from "./tasks.js";
import { locationName } from "./locations.js";
import { SquareRenderer } from "./squareRenderer.js";

/** Duración de la caída al dormirse, en segundos. */
export const ATTACK_TIME = 0.9;
/** Duración de la animación de despertar. */
export const WAKE_TIME = 1.4;
/** Cada cuánto se compara lo visual con el último snapshot. */
export const RECONCILE_EVERY = 0.5;

const NEIGHBORS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const PATIENT_EVENTS = new Set([
  "patientWoke", "attackStarted", "roomAssigned", "queuedForRoom", "attentionAssigned", "queuedForStaff",
]);
const DEFAULT_WAKE = ["¡Ajá! ¿Qué pasó?"];
/** Mitad del lado de la caja de selección (los cuadritos son de 12×12). */
const PICK_HALF = 7;

/** Texto de visualStatus por estado interno (contrato, sección 5). */
const STATUS_TEXT = {
  Caminando: "caminando",
  Atacado: "atacado",
  Esperando: "esperando",
  EnTraslado: "en traslado",
  SiendoAtendido: "siendo atendido",
  Despertando: "despertando",
  Patrullando: "patrullando",
  Atendiendo: "atendiendo",
  Transportando: "transportando",
  EnBase: "en base",
};

const staffKind = (kind) => (kind === "doctor" || kind === "orderly" ? kind : "other");
const inBothQueues = (snap, id) =>
  Boolean(snap?.roomQueue?.includes(id) && snap?.staffQueue?.includes(id));
const findSnapPatient = (snap, id) => snap?.patients?.find((p) => p.id === id) ?? null;
const findSnapStaff = (snap, id) => snap?.staff?.find((s) => s.id === id) ?? null;

export class Director {
  /**
   * @param {World} world mundo de generateWorld
   * @param {{ robots?: number, rng?: () => number, phrases?: object }} [options]
   *   robots: 1..3 camillas robot; rng: azar inyectable (tests deterministas);
   *   phrases: el contenido de data/phrases.json para el globo al despertar.
   */
  constructor(world, { robots = 2, rng = Math.random, phrases = null } = {}) {
    this.world = world;
    this.rng = rng;
    this.phrases = phrases;
    /** Último snapshot recibido. */
    this.snapshot = null;
    /** @type {Map<string, Entity>} todas las entidades, en orden de creación */
    this.byId = new Map();
    /** @type {Map<string, PatientRecord>} trabajos y datos de cada paciente */
    this.records = new Map();
    this.robots = [];
    /** Traslados que esperan una camilla robot libre (FIFO). */
    this.pendingTransfers = [];
    this.reservedBy = new Map(); // "tx,ty" -> id
    this.reservationOf = new Map(); // id -> "tx,ty"
    this.bubbles = [];
    this.reconcileClock = 0;
    this.spotsCache = new Map();
    this.defaultRenderer = null;

    this.pois = world.pois.filter((p) => world.walkable(p.tx, p.ty) && !roomAt(world, p.tx, p.ty));
    this.hallways = world.zones.filter((z) => z.location.endsWith("Hallway"));

    const count = Math.max(1, Math.min(3, Math.trunc(robots) || 1));
    for (let i = 0; i < count; i++) {
      const home = world.robotBase[i % world.robotBase.length];
      const r = new Entity("robot", `R-${i + 1}`, home);
      r.slot = i % world.robotBase.length;
      r.state = "EnBase";
      r.transfer = null;
      this.add(r);
      this.reserve(r, home);
      setTasks(r, this, [hold("idle")]);
      this.robots.push(r);
    }
  }

  // =========================================================================
  // Interfaz del contrato.

  /**
   * Crea las entidades que no existan: pacientes y personal aparecen en la
   * entrada. Si el snapshot ya da a un paciente dormido, lo pone directo en
   * su cama o en el pasillo, y a quien lo atiende a su lado. No destruye nada.
   */
  sync(snapshot) {
    if (!snapshot) return;
    this.snapshot = snapshot;
    for (const sp of snapshot.patients ?? []) {
      if (!this.records.has(sp.id)) this.createPatient(sp, snapshot);
    }
    for (const st of snapshot.staff ?? []) {
      if (!this.byId.has(st.id)) this.createStaff(st, snapshot);
    }
  }

  /** Convierte los eventos de un Result en trabajos por paciente. */
  apply(events, snapshot) {
    this.sync(snapshot);
    for (const event of events ?? []) {
      if (!PATIENT_EVENTS.has(event.type)) continue; // admisiones y contrataciones: ya las hizo sync
      const rec = this.records.get(event.patient);
      if (rec) this.enqueue(rec, event, snapshot);
    }
    if (snapshot) this.snapshot = snapshot;
  }

  /** Avanza la animación `dt` segundos (ya multiplicados por la velocidad). */
  update(dt) {
    dt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    for (const rec of this.records.values()) this.pump(rec, dt);
    for (const e of this.byId.values()) {
      runTasks(e, this, dt);
      e.animTime += dt;
    }
    this.followCarriers();
    for (const e of this.byId.values()) {
      if (isIdle(e)) this.giveIdle(e);
    }
    for (const rec of this.records.values()) this.trackZone(rec);

    this.reconcileClock += dt;
    if (this.reconcileClock >= RECONCILE_EVERY) {
      this.reconcileClock = 0;
      this.reconcile();
    }

    for (const b of this.bubbles) b.bubble.update(dt);
    this.bubbles = this.bubbles.filter((b) => !b.bubble.done);
  }

  /**
   * Dibuja las entidades ordenadas por Y. El contexto llega escalado por el
   * zoom: (sx, sy) es el centro de la entidad en esas unidades (a zoom 1,
   * píxeles de pantalla). Después dibuja los globos de diálogo.
   */
  draw(ctx, camera, renderer) {
    const r = renderer?.drawEntity ? renderer : this.fallbackRenderer();
    const z = camera.zoom || 1;
    const margin = 16;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(z, z);
    for (const e of this.drawOrder()) {
      const sx = (Math.round(e.x * z) - camera.offsetX) / z;
      const sy = (Math.round(e.y * z) - camera.offsetY) / z;
      if (sx < -margin || sy < -margin || sx > camera.visibleW + margin || sy > camera.visibleH + margin) continue;
      r.drawEntity(ctx, e, sx, sy);
    }
    ctx.restore();

    for (const b of this.bubbles) {
      const e = this.byId.get(b.id);
      if (!e) continue;
      const p = camera.toScreen(e.x, e.y - 8);
      b.bubble.x = Math.round(p.x);
      b.bubble.y = Math.round(p.y);
      b.bubble.draw(ctx);
    }
  }

  /** Entidad bajo el punto de mundo (la de más arriba en el dibujo), o null. */
  pick(wx, wy) {
    const list = this.drawOrder();
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (Math.abs(wx - e.x) <= PICK_HALF && Math.abs(wy - e.y) <= PICK_HALF) return { kind: e.kind, id: e.id };
    }
    return null;
  }

  /** Camillas robot en base (las que pueden salir ya). */
  robotsFree() {
    return this.robots.filter((r) => r.state === "EnBase").length;
  }

  /**
   * Nombre EXACTO de hospital.Location de la zona donde está el paciente. En
   * una habitación o una puerta, la última zona que pisó.
   */
  locationOf(patientId) {
    const rec = this.records.get(patientId);
    if (!rec) return null;
    return this.zoneHere(rec.entity)?.location ?? rec.lastZone;
  }

  /** Estado visual en el vocabulario del contrato, o "" si no existe. */
  visualStatus(id) {
    const st = this.stateOf(id);
    if (STATUS_TEXT[st]) return STATUS_TEXT[st];
    const e = this.byId.get(id);
    if (!e) return "";
    // Estados de paso sin texto propio en el contrato (YendoAlPaciente y
    // RegresandoABase): cuentan como parte del traslado o de la atención.
    if (e.kind === "robot") return "transportando";
    return e.role === "transport" ? "transportando" : "atendiendo";
  }

  // =========================================================================
  // Consultas extra (tests, preview y la ficha).

  /** @returns {Entity|null} */
  entity(id) {
    return this.byId.get(id) ?? null;
  }

  /** Lista de entidades en orden de creación. */
  get entities() {
    return [...this.byId.values()];
  }

  /**
   * Estado de la máquina visual con el detalle interno (p. ej.
   * "RegresandoABase" o "YendoAlPaciente"); visualStatus lo traduce.
   */
  stateOf(id) {
    const e = this.byId.get(id);
    if (!e) return "";
    if (e.kind === "patient") {
      if (e.state !== "Dormido") return e.state;
      return this.isBeingAttended(this.records.get(id)) ? "SiendoAtendido" : "Esperando";
    }
    return e.state;
  }

  /** Habitación (número) en cuya cama está el paciente en el mapa, o 0. */
  bedOf(patientId) {
    return this.records.get(patientId)?.bedRoom ?? 0;
  }

  /** ID del personal que atiende al paciente en el mapa, o "". */
  attenderOf(patientId) {
    for (const e of this.byId.values()) {
      if (e.kind !== "patient" && e.kind !== "robot" && e.assignment === patientId) return e.id;
    }
    return "";
  }

  /**
   * true si no hay trabajos ni traslados pendientes y el mapa ya coincide con
   * el último snapshot (dormidos, camas y quién atiende a quién).
   */
  get settled() {
    for (const rec of this.records.values()) if (rec.job || rec.jobs.length) return false;
    return this.pendingTransfers.length === 0 && this.matchesSnapshot();
  }

  /** true si lo visual coincide con el último snapshot. */
  matchesSnapshot() {
    const snap = this.snapshot;
    if (!snap) return true;
    for (const sp of snap.patients ?? []) {
      const rec = this.records.get(sp.id);
      if (!rec) return false;
      if (sp.asleep === this.isAwake(rec.entity)) return false;
      if (sp.asleep && sp.room && this.roomSpots(sp.room) && rec.bedRoom !== sp.room) return false;
    }
    for (const st of snap.staff ?? []) {
      const s = this.byId.get(st.id);
      if (!s || (s.assignment ?? "") !== (st.busyWith ?? "")) return false;
    }
    return true;
  }

  /** Cambia las frases del globo (p. ej. tras loadPhrases()). */
  setPhrases(phrases) {
    this.phrases = phrases;
  }

  // =========================================================================
  // Creación de entidades.

  add(e) {
    this.byId.set(e.id, e);
    return e;
  }

  createPatient(sp, snap) {
    const p = this.add(new Entity("patient", sp.id, this.freeTileNear(this.world.spawn, null)));
    p.state = "Caminando";
    p.carriedBy = null;
    /** @typedef {{entity: Entity, jobs: object[], job: object|null, bedRoom: number, transfer: object|null, lastZone: string|null}} PatientRecord */
    const rec = { entity: p, jobs: [], job: null, bedRoom: 0, transfer: null, lastZone: null };
    this.records.set(sp.id, rec);
    this.reserve(p, p.tile);

    if (sp.asleep) {
      const spots = sp.room ? this.roomSpots(sp.room) : null;
      if (spots) {
        this.putInBed(rec, sp.room);
      } else {
        p.placeAt(this.hallwaySpotFor(sp.location, p));
        this.reserve(p, p.tile);
        this.fallAsleepNow(rec);
      }
      p.flags.alert = inBothQueues(snap, sp.id);
    }
    this.trackZone(rec);
    return rec;
  }

  createStaff(st, snap) {
    const s = this.add(new Entity(staffKind(st.kind), st.id, this.freeTileNear(this.world.spawn, null)));
    s.state = "Patrullando";
    s.assignment = null;
    s.role = null;
    s.targetRoom = 0;
    this.reserve(s, s.tile);

    // Si ya atiende a alguien dormido, aparece a su lado atendiendo.
    const rec = st.busyWith ? this.records.get(st.busyWith) : null;
    const sp = findSnapPatient(snap, st.busyWith);
    if (rec && sp?.asleep && rec.entity.state === "Dormido") {
      const spots = rec.bedRoom ? this.roomSpots(rec.bedRoom) : null;
      const tile = spots ? spots.bedside : this.besideTile(rec.entity, s);
      s.placeAt(tile);
      this.reserve(s, tile);
      s.assignment = st.busyWith;
      s.role = "attend";
      s.targetRoom = rec.bedRoom;
      s.state = "Atendiendo";
      s.face(rec.entity.x, rec.entity.y);
      this.holdNow(s, "attend");
    }
    return s;
  }

  // =========================================================================
  // Trabajos por paciente.

  enqueue(rec, event, snap, synthetic = false) {
    rec.jobs.push({ event, snap, synthetic, t: 0, done: false });
    this.pump(rec, 0);
  }

  // Arranca y avanza los trabajos del paciente; los instantáneos se encadenan.
  pump(rec, dt) {
    for (let guard = 0; guard < 16; guard++) {
      if (!rec.job) {
        rec.job = rec.jobs.shift() ?? null;
        if (!rec.job) return;
        this.startJob(rec, rec.job);
      }
      if (!this.pollJob(rec, rec.job, dt)) return;
      rec.job = null;
      dt = 0;
    }
  }

  startJob(rec, job) {
    const { event, snap } = job;
    const p = rec.entity;
    switch (event.type) {
      case "attackStarted":
        return this.startAttack(rec, job);
      case "roomAssigned":
        return this.startRoomAssigned(rec, job);
      case "attentionAssigned":
        this.ensureAsleep(rec);
        p.flags.alert = inBothQueues(snap, p.id);
        this.startAttention(rec, event.staff);
        job.done = true;
        return;
      case "queuedForRoom":
      case "queuedForStaff":
        this.ensureAsleep(rec);
        p.flags.alert = inBothQueues(snap, p.id);
        job.done = true;
        return;
      case "patientWoke":
        return this.startWake(rec, job);
      default:
        job.done = true;
    }
  }

  pollJob(rec, job, dt) {
    if (job.done) return true;
    job.t += dt;
    const p = rec.entity;
    switch (job.event.type) {
      case "attackStarted": {
        // Cae donde está: termina de acomodarse en el centro de su tile.
        const c = tileCenter(p.tile);
        const k = Math.min(1, dt * 8);
        p.x += (c.x - p.x) * k;
        p.y += (c.y - p.y) * k;
        if (job.t < ATTACK_TIME) return false;
        this.fallAsleepNow(rec);
        return true;
      }
      case "roomAssigned": {
        const tr = job.transfer;
        if (tr.done || tr.cancelled) return true;
        // Si despierta antes de que lo recojan, el traslado ya no hace falta.
        if (!tr.pickedUp && rec.jobs.some((j) => j.event.type === "patientWoke")) {
          this.cancelTransfer(tr);
          return true;
        }
        return false;
      }
      case "patientWoke": {
        if (job.t < WAKE_TIME) return false;
        rec.bedRoom = 0;
        p.state = "Caminando";
        p.setAnim("idle");
        setTasks(p, this, []); // giveIdle lo pone a pasear
        return true;
      }
      default:
        return true;
    }
  }

  startAttack(rec, job) {
    const p = rec.entity;
    if (!this.isAwake(p)) {
      job.done = true; // ya estaba dormido: nada que animar
      return;
    }
    // La lógica dice dónde fue el ataque. Si el cuadrito está en otra zona
    // (p. ej. el caso de prueba ataca en la cafetería a quien sigue en la
    // entrada), se le pone en esa zona para que mapa y registro coincidan.
    const name = locationName(job.event.location);
    if (this.world.zones.some((z) => z.location === name) && this.zoneHere(p)?.location !== name) {
      const spot = this.hallwaySpotFor(job.event.location, p);
      if (spot) {
        this.release(p);
        p.placeAt(spot);
        this.trackZone(rec);
      }
    }
    this.holdNow(p, "attack");
    p.moving = false;
    p.state = "Atacado";
    this.reserve(p, p.tile);
    p.flags.alert = inBothQueues(job.snap, p.id);
  }

  startRoomAssigned(rec, job) {
    const { event, snap } = job;
    const p = rec.entity;
    const room = event.room;
    if (!this.roomSpots(room) || rec.bedRoom === room) {
      job.done = true;
      return;
    }
    this.ensureAsleep(rec);
    p.flags.alert = inBothQueues(snap, p.id);

    const transfer = { patientId: p.id, room, carrier: null, pickedUp: false, done: false, cancelled: false };
    job.transfer = transfer;
    rec.transfer = transfer;

    // Quién atiende según el snapshot del evento.
    const attenderId = findSnapPatient(snap, p.id)?.attendedBy ?? "";
    const attender = attenderId ? this.byId.get(attenderId) : null;
    const kind = findSnapStaff(snap, attenderId)?.kind ?? attender?.kind;
    if (attender && kind === "orderly") {
      this.orderlyTransfer(attender, transfer);
    } else {
      if (attender) this.sendToBedside(attender, p.id, room);
      this.requestRobot(transfer);
    }
  }

  startWake(rec, job) {
    const p = rec.entity;
    if (rec.transfer) this.cancelTransfer(rec.transfer);
    if (this.isAwake(p)) {
      job.done = true;
      return;
    }
    p.state = "Despertando";
    p.flags.alert = false;
    this.holdNow(p, "wake");
    this.say(p, pickPhrase(this.phrases, "wake", this.rng) || DEFAULT_WAKE[0]);
    // El personal que lo atendía vuelve a patrullar.
    for (const e of this.byId.values()) {
      if (e.assignment === p.id) this.releaseStaff(e);
    }
  }

  // Quien atiende camina al paciente: al bedside si tiene (o va a tener)
  // cama, o a su lado en el pasillo; y se queda con `attend`.
  startAttention(rec, staffId) {
    const s = this.byId.get(staffId);
    if (!s || s.kind === "robot" || s.kind === "patient") return;
    const p = rec.entity;
    const room = rec.bedRoom || rec.transfer?.room || 0;
    if (s.assignment === p.id && (s.role === "transport" || s.targetRoom === room)) return; // ya va para allá
    if (room) this.sendToBedside(s, p.id, room);
    else this.sendBeside(s, p.id);
  }

  // =========================================================================
  // Personal.

  // Asigna el personal al paciente; si llevaba a otro en camilla, lo suelta.
  takeStaff(s, patientId) {
    if (s.carrying && s.carrying !== patientId) {
      const other = this.records.get(s.carrying);
      if (other?.transfer) this.cancelTransfer(other.transfer);
    }
    s.assignment = patientId;
  }

  releaseStaff(s) {
    if (s.carrying) {
      const rec = this.records.get(s.carrying);
      if (rec?.transfer) this.cancelTransfer(rec.transfer);
    }
    s.assignment = null;
    s.role = null;
    s.targetRoom = 0;
    s.state = "Patrullando";
    setTasks(s, this, []); // giveIdle lo pone a patrullar
  }

  sendToBedside(s, patientId, room) {
    const spots = this.roomSpots(room);
    if (!spots) return;
    const rec = this.records.get(patientId);
    // Si ya lo atendía en el pasillo, se queda con él hasta que lo recojan.
    const stayUntilPickup = s.assignment === patientId && s.state === "Atendiendo" && rec && rec.bedRoom !== room;
    this.takeStaff(s, patientId);
    s.role = "attend";
    s.targetRoom = room;
    const go = [setState("YendoAlPaciente"), ...attend(patientId, () => spots.bedside)];
    if (stayUntilPickup) {
      setTasks(s, this, [waitUntil(() => rec.entity.carriedBy || rec.bedRoom === room || !rec.transfer, { timeout: 60 }), ...go]);
    } else {
      s.state = "YendoAlPaciente";
      setTasks(s, this, go);
    }
  }

  sendBeside(s, patientId) {
    const p = this.byId.get(patientId);
    this.takeStaff(s, patientId);
    s.role = "attend";
    s.targetRoom = 0;
    s.state = "YendoAlPaciente";
    setTasks(s, this, attend(patientId, (e) => this.besideTile(p, e)));
  }

  // El camillero que atiende recoge al paciente, lo empuja a la cama y se
  // queda atendiéndolo al bedside.
  orderlyTransfer(o, transfer) {
    const spots = this.roomSpots(transfer.room);
    this.takeStaff(o, transfer.patientId);
    o.role = "transport";
    o.targetRoom = transfer.room;
    o.state = "YendoAlPaciente";
    transfer.carrier = o.id;
    setTasks(o, this, [
      ...pickUp(transfer.patientId),
      ...transportToBed(transfer.patientId, transfer.room, { anim: "push" }),
      call((e) => {
        e.role = "attend";
        e.state = "YendoAlPaciente";
      }),
      ...attend(transfer.patientId, () => spots.bedside),
    ]);
  }

  // =========================================================================
  // Camillas robot.

  requestRobot(transfer) {
    const robot = this.freeRobotFor(transfer);
    if (robot) this.dispatchRobot(robot, transfer);
    else this.pendingTransfers.push(transfer);
  }

  // La camilla libre más cercana al paciente (empate: la de menor número).
  freeRobotFor(transfer) {
    const p = this.byId.get(transfer.patientId);
    let best = null;
    for (const r of this.robots) {
      if (r.state !== "EnBase") continue;
      if (!best || manhattan(r.tile, p.tile) < manhattan(best.tile, p.tile)) best = r;
    }
    return best;
  }

  dispatchRobot(r, transfer) {
    transfer.carrier = r.id;
    r.transfer = transfer;
    r.state = "YendoAlPaciente";
    setTasks(r, this, [
      ...pickUp(transfer.patientId),
      ...transportToBed(transfer.patientId, transfer.room),
      ...returnToBase(() => this.dispatchPending()),
    ]);
  }

  // Un robot llegó a base: atiende el traslado que más lleva esperando.
  dispatchPending() {
    while (this.pendingTransfers.length > 0) {
      const transfer = this.pendingTransfers[0];
      if (transfer.cancelled || transfer.done) {
        this.pendingTransfers.shift();
        continue;
      }
      const robot = this.freeRobotFor(transfer);
      if (!robot) return;
      this.pendingTransfers.shift();
      this.dispatchRobot(robot, transfer);
    }
  }

  // Anula un traslado: si ya lo llevaba, lo deja donde va; quien cargaba vuelve
  // a su rutina.
  cancelTransfer(transfer) {
    if (transfer.cancelled || transfer.done) return;
    transfer.cancelled = true;
    this.pendingTransfers = this.pendingTransfers.filter((t) => t !== transfer);
    const rec = this.records.get(transfer.patientId);
    if (rec?.transfer === transfer) rec.transfer = null;
    const carrier = transfer.carrier ? this.byId.get(transfer.carrier) : null;
    const p = rec?.entity;
    if (p?.carriedBy) {
      p.carriedBy = null;
      p.placeAt(carrier ? carrier.tile : p.tile);
      p.state = "Dormido";
      this.holdNow(p, "sleep");
      this.reserve(p, p.tile);
    }
    if (!carrier) return;
    carrier.carrying = undefined;
    if (carrier.kind === "robot") {
      carrier.transfer = null;
      setTasks(carrier, this, returnToBase(() => this.dispatchPending()));
    } else if (carrier.assignment === transfer.patientId) {
      carrier.role = "attend";
      carrier.state = "Patrullando";
      carrier.assignment = null;
      setTasks(carrier, this, []);
    }
  }

  // =========================================================================
  // Ganchos que usan las tareas (ver la cabecera de tasks.js).

  pickUp(carrier, patientId) {
    const rec = this.records.get(patientId);
    if (!rec) return;
    const p = rec.entity;
    this.release(p);
    this.holdNow(p, "stretcher");
    p.carriedBy = carrier.id;
    p.state = "EnTraslado";
    p.flags.alert = false;
    rec.bedRoom = 0;
    carrier.carrying = patientId;
    carrier.state = "Transportando";
    if (rec.transfer && rec.transfer.carrier === carrier.id) rec.transfer.pickedUp = true;
    this.followCarriers();
  }

  dropInBed(carrier, patientId, room) {
    const rec = this.records.get(patientId);
    carrier.carrying = undefined;
    if (carrier.kind === "robot") carrier.transfer = null;
    if (!rec) return;
    this.putInBed(rec, room);
    const tr = rec.transfer;
    if (tr && tr.room === room) {
      tr.done = true;
      rec.transfer = null;
    }
    // Quien ya lo esperaba al bedside lo mira.
    for (const e of this.byId.values()) {
      if (e.assignment === patientId && e.state === "Atendiendo") e.face(rec.entity.x, rec.entity.y);
    }
  }

  bedIsFree(room, patientId) {
    for (const [id, rec] of this.records) {
      if (id !== patientId && rec.bedRoom === room) return false;
    }
    return true;
  }

  /**
   * Puntos útiles de una habitación: cama (cabecera), pies, posición del
   * paciente acostado, tile de descarga de la camilla y bedside. Null si el
   * mundo no tiene esa habitación.
   */
  roomSpots(number) {
    if (this.spotsCache.has(number)) return this.spotsCache.get(number);
    const room = this.world.rooms.find((r) => r.number === number);
    let spots = null;
    if (room) {
      const { world } = this;
      const tileOf = (t) => world.tiles[t.ty * world.cols + t.tx];
      const around = (t) => NEIGHBORS.map(([dx, dy]) => ({ tx: t.tx + dx, ty: t.ty + dy }));
      const foot = around(room.bed).find((t) => tileOf(t) === TILE.BED) ?? null;
      const head = tileCenter(room.bed);
      const footC = foot ? tileCenter(foot) : head;
      const free = (t) => world.walkable(t.tx, t.ty) && !sameTile(t, room.bedside);
      const drop = (foot && around(foot).find(free)) ?? around(room.bed).find(free) ?? room.bedside;
      spots = {
        number,
        bed: room.bed,
        foot,
        bedPos: { x: (head.x + footC.x) / 2, y: (head.y + footC.y) / 2 },
        drop,
        bedside: room.bedside,
        door: room.door,
      };
    }
    this.spotsCache.set(number, spots);
    return spots;
  }

  /** Reserva el tile para la entidad (destino o donde está quieta). */
  reserve(e, tile) {
    this.release(e);
    const key = tileKey(tile);
    this.reservedBy.set(key, e.id);
    this.reservationOf.set(e.id, key);
  }

  release(e) {
    const key = this.reservationOf.get(e.id);
    if (key === undefined) return;
    this.reservationOf.delete(e.id);
    if (this.reservedBy.get(key) === e.id) this.reservedBy.delete(key);
  }

  /** A* desde el tile de la entidad evitando lo reservado por otros; sin eso, el camino libre. */
  planPath(e, goal) {
    const own = this.reservationOf.get(e.id);
    const occupied = new Set();
    for (const key of this.reservedBy.keys()) if (key !== own) occupied.add(key);
    return findPath(this.world, e.tile, goal, { occupied }) ?? findPath(this.world, e.tile, goal);
  }

  /** true si alguien quieto (que no sea su carga ni quien la lleva) está en el tile. */
  isBlocked(e, tile) {
    for (const o of this.byId.values()) {
      if (o === e || o.moving || o.carriedBy) continue;
      if (e && (o.id === e.carrying || (e.id && o.carrying === e.id))) continue;
      if (this.records.get(o.id)?.bedRoom) continue; // acostado: su tile es la cama
      if (sameTile(o.tile, tile)) return true;
    }
    return false;
  }

  /** Tile libre: sin reserva ajena y sin nadie quieto encima. */
  isFreeTile(tile, e) {
    if (!this.world.walkable(tile.tx, tile.ty)) return false;
    const by = this.reservedBy.get(tileKey(tile));
    if (by !== undefined && by !== e?.id) return false;
    return !this.isBlocked(e, tile);
  }

  /**
   * Primer tile libre en anchura desde `origin` (incluido, salvo `exclude`),
   * hasta `maxR` pasos. Si no hay, el propio origen.
   */
  freeTileNear(origin, e, { exclude = null, maxR = 6, filter = null } = {}) {
    const { world } = this;
    const seen = new Set([tileKey(origin)]);
    let frontier = [origin];
    for (let r = 0; r <= maxR && frontier.length; r++) {
      const next = [];
      for (const t of frontier) {
        const ok = !sameTile(t, exclude) && (!filter || filter(t)) && this.isFreeTile(t, e);
        if (ok) return { tx: t.tx, ty: t.ty };
        for (const [dx, dy] of NEIGHBORS) {
          const n = { tx: t.tx + dx, ty: t.ty + dy };
          const key = tileKey(n);
          if (seen.has(key) || !world.walkable(n.tx, n.ty)) continue;
          seen.add(key);
          next.push(n);
        }
      }
      frontier = next;
    }
    return { tx: origin.tx, ty: origin.ty };
  }

  /** Tile al lado del paciente dormido en el pasillo (fuera de las habitaciones). */
  besideTile(p, e) {
    const notInRoom = (t) => !roomAt(this.world, t.tx, t.ty);
    return this.freeTileNear(p.tile, e, { exclude: p.tile, maxR: 4, filter: notInRoom });
  }

  /** Poi libre al azar para un paciente que pasea (nunca dentro de habitaciones). */
  randomPoiTile(e) {
    const n = this.pois.length;
    if (n === 0) return this.randomPatrolTile(e);
    const start = Math.floor(this.rng() * n) % n;
    for (let i = 0; i < n; i++) {
      const poi = this.pois[(start + i) % n];
      if (!sameTile(poi, e.tile) && this.isFreeTile(poi, e)) return { tx: poi.tx, ty: poi.ty };
    }
    return this.freeTileNear(this.pois[start], e);
  }

  /** Tile libre al azar en algún pasillo. */
  randomPatrolTile(e) {
    const zones = this.hallways.length ? this.hallways : this.world.zones;
    for (let tries = 0; tries < 24; tries++) {
      const z = zones[Math.floor(this.rng() * zones.length) % zones.length];
      const t = {
        tx: z.rect.tx + (Math.floor(this.rng() * z.rect.w) % z.rect.w),
        ty: z.rect.ty + (Math.floor(this.rng() * z.rect.h) % z.rect.h),
      };
      if (!sameTile(t, e.tile) && this.isFreeTile(t, e)) return t;
    }
    return e.tile;
  }

  /** Puesto de carga del robot. */
  homeTile(r) {
    return this.world.robotBase[r.slot];
  }

  // =========================================================================
  // Internos.

  isAwake(p) {
    return p.state === "Caminando" || p.state === "Despertando";
  }

  // Un evento de cama o de cola para alguien que en el mapa sigue despierto
  // (eventos que llegaron sin su ataque): se duerme ya, sin animación.
  ensureAsleep(rec) {
    if (this.isAwake(rec.entity)) this.fallAsleepNow(rec);
  }

  fallAsleepNow(rec) {
    const p = rec.entity;
    p.moving = false;
    if (!rec.bedRoom) {
      p.placeAt(p.tile);
      this.reserve(p, p.tile);
    }
    p.state = "Dormido";
    this.holdNow(p, "sleep");
  }

  putInBed(rec, room) {
    const p = rec.entity;
    const spots = this.roomSpots(room);
    this.release(p);
    p.carriedBy = null;
    p.moving = false;
    rec.bedRoom = room;
    p.tile = { tx: spots.bed.tx, ty: spots.bed.ty };
    p.x = spots.bedPos.x;
    p.y = spots.bedPos.y;
    p.dir = "down";
    p.state = "Dormido";
    this.holdNow(p, "sleep");
  }

  // Deja a la entidad quieta con la animación puesta desde ya (hold solo la
  // pondría en el próximo update).
  holdNow(e, anim) {
    setTasks(e, this, [hold(anim)]);
    e.moving = false;
    e.setAnim(anim);
  }

  // Lo atienden si quien tiene asignado ya llegó: al bedside de su cama o a
  // un par de tiles en el pasillo.
  isBeingAttended(rec) {
    if (!rec) return false;
    const p = rec.entity;
    for (const s of this.byId.values()) {
      if (s.assignment !== p.id || s.state !== "Atendiendo") continue;
      if (rec.bedRoom) return s.targetRoom === rec.bedRoom;
      return manhattan(s.tile, p.tile) <= 2;
    }
    return false;
  }

  // Tile del pasillo donde poner a quien ya llega dormido sin cama.
  hallwaySpotFor(location, e) {
    const name = locationName(location);
    const zone = this.world.zones.find((z) => z.location === name)
      ?? this.world.zones.find((z) => z.location === "Main Hallway")
      ?? this.world.zones[0];
    const r = zone.rect;
    const center = { tx: r.tx + Math.floor(r.w / 2), ty: r.ty + Math.floor(r.h / 2) };
    return this.freeTileNear(center, e, { maxR: 10 });
  }

  // Rutina cuando una entidad se queda sin tareas.
  giveIdle(e) {
    if (e.kind === "patient") {
      if (e.state === "Caminando") setTasks(e, this, wanderToPoi());
      else if (e.state === "Dormido") setTasks(e, this, [hold("sleep")]);
      return;
    }
    if (e.kind === "robot") {
      if (!e.transfer) setTasks(e, this, returnToBase(() => this.dispatchPending()));
      return;
    }
    // Con paciente asignado pero sin tareas (p. ej. tras un traslado
    // anulado): vuelve con él si sigue dormido; si no, a patrullar.
    const rec = e.assignment ? this.records.get(e.assignment) : null;
    if (rec && rec.entity.state === "Dormido") {
      e.assignment = null;
      this.startAttention(rec, e.id);
    } else {
      e.assignment = null;
      e.role = null;
      e.state = "Patrullando";
      setTasks(e, this, patrol());
    }
  }

  // Los pacientes en camilla siguen a quien los lleva: encima del robot o
  // delante del camillero.
  followCarriers() {
    for (const rec of this.records.values()) {
      const p = rec.entity;
      if (!p.carriedBy) continue;
      const c = this.byId.get(p.carriedBy);
      if (!c) continue;
      const ahead = c.kind === "robot" ? 0 : 10;
      const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[c.dir];
      p.x = c.x + dx * ahead;
      p.y = c.y + dy * ahead;
      p.tile = { tx: c.tile.tx, ty: c.tile.ty };
      p.dir = c.dir;
    }
  }

  zoneHere(e) {
    const t = e.carriedBy ? (this.byId.get(e.carriedBy)?.tile ?? e.tile) : e.tile;
    return zoneAt(this.world, t.tx, t.ty);
  }

  trackZone(rec) {
    const z = this.zoneHere(rec.entity);
    if (z) rec.lastZone = z.location;
  }

  say(e, text) {
    this.bubbles = this.bubbles.filter((b) => b.id !== e.id);
    this.bubbles.push({ id: e.id, bubble: new Bubble(text, 0, 0) });
  }

  // Orden de dibujo: por Y; quien va en camilla, justo después de quien lo lleva.
  drawOrder() {
    const key = (e) => {
      const c = e.carriedBy ? this.byId.get(e.carriedBy) : null;
      return c ? Math.max(c.y, e.y) + 0.5 : e.y;
    };
    return [...this.byId.values()].sort((a, b) => key(a) - key(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  fallbackRenderer() {
    this.defaultRenderer ??= new SquareRenderer();
    return this.defaultRenderer;
  }

  // Compara lo visual con el último snapshot y encola lo que falte. Solo toca
  // a quien no tiene trabajos pendientes; al personal, cuando nadie tiene.
  reconcile() {
    const snap = this.snapshot;
    if (!snap) return;
    let busy = this.pendingTransfers.length > 0;
    for (const sp of snap.patients ?? []) {
      const rec = this.records.get(sp.id);
      if (!rec) continue;
      if (rec.job || rec.jobs.length) {
        busy = true;
        continue;
      }
      if (this.reconcilePatient(rec, sp, snap)) busy = true;
    }
    if (busy) return;
    for (const st of snap.staff ?? []) {
      const s = this.byId.get(st.id);
      if (!s) continue;
      if (st.busyWith && s.assignment !== st.busyWith) {
        const rec = this.records.get(st.busyWith);
        if (rec && rec.entity.state === "Dormido") {
          this.enqueue(rec, { type: "attentionAssigned", patient: st.busyWith, staff: st.id }, snap, true);
        }
      } else if (!st.busyWith && s.assignment) {
        this.releaseStaff(s);
      }
    }
  }

  // Devuelve true si encoló un trabajo.
  reconcilePatient(rec, sp, snap) {
    const p = rec.entity;
    const synth = (event) => {
      this.enqueue(rec, { patient: sp.id, ...event }, snap, true);
      return true;
    };
    if (sp.asleep && this.isAwake(p) && p.state !== "Despertando") {
      return synth({ type: "attackStarted", location: sp.location });
    }
    if (!sp.asleep && !this.isAwake(p) && !p.carriedBy) {
      return synth({ type: "patientWoke", room: rec.bedRoom, staff: "" });
    }
    if (sp.asleep && sp.room && rec.bedRoom !== sp.room && !p.carriedBy && !rec.transfer && this.roomSpots(sp.room)) {
      return synth({ type: "roomAssigned", room: sp.room });
    }
    p.flags.alert = sp.asleep && inBothQueues(snap, sp.id);
    return false;
  }
}
