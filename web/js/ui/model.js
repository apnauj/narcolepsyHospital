// Lógica pura de los widgets y de las escenas: qué mostrar, en qué orden y
// qué botones están habilitados. Sin DOM, para probarla con node --test.
import { levelLabel, patientStateLabel, staffRoleLabel, locationName } from "./describe.js";

// Límites de POST /api/patients y /api/staff (contrato, sección 2).
export const MAX_PATIENTS = 30;
export const MAX_STAFF = 12;

// ---------- Retratos ----------

// Hash FNV-1a de 32 bits: estable entre navegadores y entre corridas.
export function hashId(id) {
  let h = 0x811c9dc5;
  for (const ch of String(id)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Color del cuadrito que reemplaza el retrato cuando no hay renderer.
export function colorFromId(id) {
  const h = hashId(id);
  return `hsl(${h % 360} 60% ${45 + ((h >>> 9) % 20)}%)`;
}

// "Wilfrido Berrío" -> "WB"; "Kelly Johana Torres" -> "KT"; "Toño" -> "TO".
export function initials(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words.at(-1)[0]).toUpperCase();
}

// ---------- Panel de colas ----------

// queueEntries arma las dos colas EN EL ORDEN del snapshot. Cada entrada
// lleva lo necesario para dibujar el retrato y la ficha; inBoth marca a
// quien espera cama y personal a la vez (el ❗ del mapa).
export function queueEntries(snapshot) {
  const byId = new Map((snapshot?.patients ?? []).map((p) => [p.id, p]));
  const roomQ = snapshot?.roomQueue ?? [];
  const staffQ = snapshot?.staffQueue ?? [];
  const entry = (id, i) => {
    const p = byId.get(id);
    const name = p?.name ?? id;
    return {
      id,
      position: i + 1,
      name,
      initials: initials(name),
      color: colorFromId(id),
      level: p?.level ?? "",
      inBoth: roomQ.includes(id) && staffQ.includes(id),
    };
  };
  return { room: roomQ.map(entry), staff: staffQ.map(entry) };
}

// ---------- Indicadores ----------

// robots: número de camillas libres, o { free, total }.
export function indicatorCounts(snapshot, robots) {
  const rooms = snapshot?.rooms ?? [];
  const staff = snapshot?.staff ?? [];
  const patients = snapshot?.patients ?? [];
  const roomsFree = rooms.filter((r) => r.occupants.length < r.capacity).length;
  const staffFree = staff.filter((s) => !s.busyWith).length;
  const asleep = patients.filter((p) => p.asleep).length;
  const robotsFree = typeof robots === "object" && robots !== null ? robots.free : robots;
  const robotsTotal = typeof robots === "object" && robots !== null ? robots.total : undefined;
  return {
    roomsFree,
    roomsBusy: rooms.length - roomsFree,
    staffFree,
    staffBusy: staff.length - staffFree,
    patientsAwake: patients.length - asleep,
    patientsAsleep: asleep,
    roomQueue: (snapshot?.roomQueue ?? []).length,
    staffQueue: (snapshot?.staffQueue ?? []).length,
    robotsFree: robotsFree ?? null,
    robotsTotal: robotsTotal ?? null,
  };
}

// ---------- Selección y acciones ----------

export function findPatient(snapshot, id) {
  return snapshot?.patients?.find((p) => p.id === id) ?? null;
}

export function findStaff(snapshot, id) {
  return snapshot?.staff?.find((s) => s.id === id) ?? null;
}

// Paciente seleccionado o null (una selección de personal o robot no cuenta).
export function selectedPatient(snapshot, selection) {
  if (!selection || selection.kind !== "patient") return null;
  return findPatient(snapshot, selection.id);
}

// chooseAttackTarget: al seleccionado si está despierto; sin selección, a
// uno despierto al azar. Devuelve { patient } o { reason } para el registro.
export function chooseAttackTarget(snapshot, selection, rng = Math.random) {
  const sel = selectedPatient(snapshot, selection);
  if (sel) {
    if (sel.asleep) return { patient: null, reason: `${sel.name} ya está durmiendo.` };
    return { patient: sel };
  }
  const awake = (snapshot?.patients ?? []).filter((p) => !p.asleep);
  if (awake.length === 0) return { patient: null, reason: "No queda nadie despierto." };
  return { patient: awake[Math.floor(rng() * awake.length) % awake.length] };
}

// chooseWakeTarget: solo al seleccionado, y solo si está dormido.
export function chooseWakeTarget(snapshot, selection) {
  const sel = selectedPatient(snapshot, selection);
  if (!sel) return { patient: null, reason: "Selecciona primero a un paciente dormido." };
  if (!sel.asleep) return { patient: null, reason: `${sel.name} no está durmiendo.` };
  return { patient: sel };
}

// Zonas donde un ataque sin director puede ocurrir: los pasillos.
const HALLWAYS = ["Main Hallway", "East Hallway", "West Hallway", "North Hallway", "South Hallway", "Pediatrics Hallway"];

// pickHallwayLocation elige una Location de pasillo (su id numérico).
export function pickHallwayLocation(locations, rng = Math.random) {
  const halls = (locations ?? []).filter((l) => HALLWAYS.includes(l.name));
  const pool = halls.length > 0 ? halls : locations ?? [];
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length) % pool.length].id;
}

// locationIdByName traduce el nombre que da director.locationOf a su id.
export function locationIdByName(locations, name) {
  return (locations ?? []).find((l) => l.name === name)?.id ?? null;
}

// toolbarState decide qué botones están habilitados.
// ctx: { mode: "free"|"scenario", snapshot, selection, busy, paused, done }
export function toolbarState({ mode, snapshot, selection, busy = false, paused = false, done = false }) {
  const free = mode === "free";
  const manual = free && !busy && Boolean(snapshot);
  const patients = snapshot?.patients ?? [];
  const staff = snapshot?.staff ?? [];
  const sel = selectedPatient(snapshot, selection);

  const canAttack = sel ? !sel.asleep : patients.some((p) => !p.asleep);
  // Sin selección el botón queda activo para avisar en el registro qué falta.
  const canWake = sel ? sel.asleep : true;

  return {
    addPatient: manual && patients.length < MAX_PATIENTS,
    addDoctor: manual && staff.length < MAX_STAFF,
    addOrderly: manual && staff.length < MAX_STAFF,
    attack: manual && canAttack,
    wakeUp: manual && canWake,
    pause: true,
    speed: true,
    next: mode === "scenario" && !busy && !done && Boolean(snapshot),
    queries: mode === "scenario" && done,
    paused,
  };
}

// ---------- Ficha ----------

// cardInfo arma los datos de Card.show para lo seleccionado.
// visual: texto de director.visualStatus(id), o "" si no hay director.
export function cardInfo(snapshot, selection, visual = "") {
  if (!selection) return null;
  if (selection.kind === "patient") {
    const p = findPatient(snapshot, selection.id);
    if (!p) return null;
    let state = patientStateLabel(p.state);
    if (p.room) state += ` (hab. ${p.room})`;
    const attender = p.attendedBy ? findStaff(snapshot, p.attendedBy) : null;
    if (attender) state += `; lo atiende ${attender.name}`;
    const queues = [];
    const r = (snapshot.roomQueue ?? []).indexOf(p.id);
    const s = (snapshot.staffQueue ?? []).indexOf(p.id);
    if (r >= 0) queues.push(`Cola de Habitaciones (puesto ${r + 1})`);
    if (s >= 0) queues.push(`Cola de Atención (puesto ${s + 1})`);
    return {
      id: p.id,
      kind: "patient",
      name: p.name,
      role: `Paciente ${p.id}, ${p.age} años, narcolepsia ${levelLabel(p.level).toLowerCase()}`,
      state,
      queues,
      visual,
    };
  }
  if (selection.kind === "robot") {
    return { id: selection.id, kind: "robot", name: `Camilla robot ${selection.id}`, role: "Camilla robot", state: visual || "—", queues: [], visual };
  }
  const st = findStaff(snapshot, selection.id);
  if (!st) return null;
  const busy = st.busyWith ? findPatient(snapshot, st.busyWith) : null;
  return {
    id: st.id,
    kind: st.kind,
    name: st.name,
    role: `${staffRoleLabel(st.kind)} ${st.id}`,
    state: st.busyWith ? `Atendiendo a ${busy?.name ?? st.busyWith}` : "Libre",
    queues: [],
    visual,
  };
}

// ---------- Escala del canvas ----------

export const SCREEN_W = 384;
export const SCREEN_H = 216;

// chooseScale da el mayor factor entero que cabe en el espacio disponible,
// entre min y max (el pixel art solo se ve bien con escalas enteras).
export function chooseScale(availW, availH, { min = 1, max = 3 } = {}) {
  const fit = Math.min(Math.floor(availW / SCREEN_W), Math.floor(availH / SCREEN_H));
  return Math.max(min, Math.min(max, fit));
}

// ---------- Consultas del escenario ----------

// formatQueries arma las 4 secciones de GET /api/queries para el panel.
// step5Notices: los avisos que devolvió el paso 5 ([5.3]).
export function formatQueries(queries, snapshot, locations, step5Notices = []) {
  const name = (id) => findPatient(snapshot, id)?.name ?? id;
  const staffName = (id) => findStaff(snapshot, id)?.name ?? id;

  const hallway = queries?.hallway ?? [];
  const sections = [
    {
      tag: "[5.1]",
      title: "Pacientes dormidos en el pasillo",
      lines: hallway.length ? hallway.map((id) => `${id} ${name(id)}`) : ["Nadie duerme en el pasillo."],
    },
    {
      tag: "[5.2]",
      title: "Episodios por doctor",
      lines: (queries?.episodes ?? []).flatMap((d) => [
        `${d.doctor} ${staffName(d.doctor)}: ${d.episodes.length} episodio(s)`,
        ...d.episodes.map((e) => {
          const where = e.room ? `hab. ${e.room}` : locationName(locations, e.location);
          return `  ${e.id}: ${e.patient} ${name(e.patient)}, ${where}`;
        }),
      ]),
    },
    {
      tag: "[5.3]",
      title: "Asignando habitación a P-004",
      lines: step5Notices.length ? step5Notices.map((n) => n.message || n.kind) : ["(sin aviso registrado)"],
    },
    {
      tag: "[5.4]",
      title: "Reporte de severidad",
      lines: (queries?.severe ?? []).map((s) => `${s.patient} ${name(s.patient)}: ${s.episodes} episodio(s)`),
    },
  ];
  for (const s of sections) if (s.lines.length === 0) s.lines.push("(vacío)");
  return sections;
}
