// Configuración del modo libre: rangos, validación y persistencia. Puro,
// salvo loadConfig/saveConfig, que reciben el storage para poder probarlos.

// Rangos de POST /api/reset (contrato, sección 2) más los de la vista.
export const LIMITS = {
  rooms: { min: 2, max: 10 },
  doctors: { min: 0, max: 6 },
  orderlies: { min: 0, max: 6 },
  patients: { min: 0, max: 12 },
  robots: { min: 1, max: 3 },
};

export const SPEEDS = [1, 2, 4];

export const DEFAULT_CONFIG = Object.freeze({
  rooms: 4,
  doctors: 2,
  orderlies: 1,
  patients: 6,
  robots: 2,
  speed: 1,
  showQueues: true,
  volume: 0, // 0..1; 0 = silencio (por defecto)
});

export const STORAGE_KEY = "hospital-costenos.config";

const LABELS = {
  rooms: "Habitaciones",
  doctors: "Doctores",
  orderlies: "Camilleros",
  patients: "Pacientes iniciales",
  robots: "Camillas robot",
};

// validateConfig revisa una configuración (por ejemplo, la del formulario,
// con números en texto). Devuelve { ok, errors: {campo: mensaje}, value },
// donde value es la configuración normalizada y solo vale si ok es true.
export function validateConfig(input) {
  const errors = {};
  const value = { ...DEFAULT_CONFIG };

  for (const [field, { min, max }] of Object.entries(LIMITS)) {
    const raw = input?.[field];
    const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
    if (!Number.isInteger(n)) {
      errors[field] = `${LABELS[field]}: escribe un número entero.`;
    } else if (n < min || n > max) {
      errors[field] = `${LABELS[field]}: debe estar entre ${min} y ${max}.`;
    } else {
      value[field] = n;
    }
  }

  // RegisterEpisode falla sin personal: el hospital necesita al menos uno.
  if (!errors.doctors && !errors.orderlies && value.doctors + value.orderlies < 1) {
    errors.staff = "Hace falta al menos un doctor o un camillero.";
  }

  const speed = Number(input?.speed);
  if (SPEEDS.includes(speed)) value.speed = speed;
  else errors.speed = "Velocidad: elige ×1, ×2 o ×4.";

  value.showQueues = input?.showQueues === undefined ? true : Boolean(input.showQueues);

  // Volumen de los sonidos (fx/audio.js): 0..1. Sin el campo (configuraciones
  // guardadas antes de que existiera) queda en silencio.
  const rawVolume = input?.volume;
  if (rawVolume === undefined || rawVolume === null || rawVolume === "") {
    value.volume = DEFAULT_CONFIG.volume;
  } else {
    const volume = Number(rawVolume);
    if (Number.isFinite(volume) && volume >= 0 && volume <= 1) value.volume = Math.round(volume * 100) / 100;
    else errors.volume = "Volumen: debe estar entre 0 y 100 %.";
  }

  return { ok: Object.keys(errors).length === 0, errors, value };
}

// normalizeConfig devuelve siempre una configuración válida: lo que no
// valide se reemplaza por el valor por defecto, campo por campo.
export function normalizeConfig(input) {
  const { value, errors } = validateConfig(input);
  const out = { ...value };
  for (const field of Object.keys(errors)) {
    if (field in DEFAULT_CONFIG) out[field] = DEFAULT_CONFIG[field];
  }
  if (out.doctors + out.orderlies < 1) {
    out.doctors = DEFAULT_CONFIG.doctors;
    out.orderlies = DEFAULT_CONFIG.orderlies;
  }
  return out;
}

// El storage puede no existir (Node, iframe sin permisos, modo privado) o
// lanzar al tocarlo: en ese caso se trabaja con los valores por defecto.
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadConfig(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// Devuelve true si se pudo guardar.
export function saveConfig(config, storage = defaultStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}
