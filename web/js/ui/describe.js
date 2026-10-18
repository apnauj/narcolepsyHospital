// Textos del registro, estilo Pokémon. Todo aquí es puro (sin DOM) para
// poder probarlo con node --test.

// Lo que muestra la vista de los valores String() de Go.
const PATIENT_STATE = {
  "Awake": "Despierto",
  "Asleep In Hallway": "Dormido en el pasillo",
  "Asleep In Bed": "Dormido en cama",
};

const LEVEL = { Mild: "Leve", Moderate: "Moderada", Severe: "Severa", Unknown: "Desconocida" };

const STAFF_ROLE = { doctor: "Doctor", orderly: "Camillero", other: "Personal" };

export function patientStateLabel(state) {
  return PATIENT_STATE[state] ?? state ?? "";
}

export function levelLabel(level) {
  return LEVEL[level] ?? level ?? "";
}

export function staffRoleLabel(kind) {
  return STAFF_ROLE[kind] ?? "Personal";
}

// Artículo según el sustantivo en español que traduce la última palabra
// del nombre de la Location ("el Main Hallway" = el pasillo, "la Cafeteria").
const ARTICLE_BY_WORD = {
  Hallway: "el", Entrance: "la", Reception: "la", Lobby: "el", Room: "la",
  Wing: "el", Tower: "la", Basement: "el", Floor: "el", Helipad: "el",
  Block: "el", Unit: "la", Area: "el", Ward: "el", Department: "el",
  Zone: "la", Bank: "el", Pharmacy: "la", Cafeteria: "la", Mortuary: "la",
};

export function locationName(locations, id) {
  const found = (locations ?? []).find((l) => l.id === id);
  return found ? found.name : `la zona ${id}`;
}

// "en el Main Hallway", "en la Cafeteria". Si no se conoce la zona, "en la zona 7".
export function inLocation(locations, id) {
  const found = (locations ?? []).find((l) => l.id === id);
  if (!found) return `en la zona ${id}`;
  const last = found.name.split(" ").at(-1);
  return `en ${ARTICLE_BY_WORD[last] ?? "el"} ${found.name}`;
}

function patientName(snapshot, id) {
  return snapshot?.patients?.find((p) => p.id === id)?.name ?? id;
}

function staffOf(snapshot, id) {
  return snapshot?.staff?.find((s) => s.id === id);
}

function staffName(snapshot, id) {
  return staffOf(snapshot, id)?.name ?? id;
}

// Puesto (1, 2...) del paciente en una cola del snapshot, o 0 si no está.
function position(queue, id) {
  return (queue ?? []).indexOf(id) + 1;
}

// describeEvent traduce un Event de la API a una frase del registro.
// snapshot es el de después del comando y locations el de GET /api/locations.
export function describeEvent(event, snapshot, locations) {
  const who = patientName(snapshot, event.patient);
  switch (event.type) {
    case "patientAdmitted":
      return `¡${who} llegó al hospital!`;

    case "staffHired": {
      const name = staffName(snapshot, event.staff);
      const kind = staffOf(snapshot, event.staff)?.kind;
      if (kind === "doctor") return `¡${name} se unió al equipo médico!`;
      if (kind === "orderly") return `¡${name} se unió al equipo de camilleros!`;
      return `¡${name} se unió al personal!`;
    }

    case "patientWoke": {
      let text = `¡${who} se despertó!`;
      if (event.room) text += ` La habitación ${event.room} queda libre.`;
      if (event.staff) text += ` ${staffName(snapshot, event.staff)} queda libre.`;
      return text;
    }

    case "attackStarted":
      return `¡${who} se quedó dormido ${inLocation(locations, event.location)}!`;

    case "roomAssigned":
      if (event.fromQueue) {
        return `¡Se liberó la habitación ${event.room}! ${who} sale de la cola y pasa a ella.`;
      }
      return `Llevan a ${who} a la habitación ${event.room}.`;

    case "queuedForRoom": {
      const n = position(snapshot?.roomQueue, event.patient);
      return `${who} espera en la Cola de Habitaciones${n ? ` (puesto ${n})` : ""}.`;
    }

    case "attentionAssigned": {
      const name = staffName(snapshot, event.staff);
      if (event.fromQueue) return `¡${name} por fin atiende a ${who}, que esperaba en la cola!`;
      return `${name} atiende a ${who}.`;
    }

    case "queuedForStaff": {
      const n = position(snapshot?.staffQueue, event.patient);
      return `${who} espera en la Cola de Atención${n ? ` (puesto ${n})` : ""}.`;
    }

    default:
      return `Pasó algo raro: ${event.type}.`;
  }
}

// describeNotice traduce un Notice (casos previstos sin cama o sin personal).
export function describeNotice(notice) {
  switch (notice.kind) {
    case "noRoom":
      return "No hay habitación libre: se queda en la cola.";
    case "noStaff":
      return "No hay personal libre: espera a que alguien lo atienda.";
    default:
      return notice.message || "Aviso del hospital.";
  }
}

// describeError formatea un error de la API para el registro.
export function describeError(err) {
  const msg = err?.message ?? String(err);
  return `¡Ups! ${msg.charAt(0).toUpperCase()}${msg.slice(1)}`;
}

// Todas las líneas que produce un Result, en orden: eventos y luego avisos.
export function describeResult(result, locations) {
  const lines = (result.events ?? []).map((e) => describeEvent(e, result.snapshot, locations));
  for (const n of result.notices ?? []) lines.push(describeNotice(n));
  return lines;
}
