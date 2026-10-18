// Cliente de la API del hospital. Es el único módulo que hace fetch.
// Cada función devuelve el JSON de la respuesta; un error HTTP se lanza
// como Error con el mensaje de {"error": "..."} y el código en err.status.
// Ver docs/gui/CONTRACT.md, sección 2.

export function getState() {
  return request("GET", "/api/state");
}

export function getLocations() {
  return request("GET", "/api/locations");
}

export function getQueries() {
  return request("GET", "/api/queries");
}

// config: { rooms, doctors, orderlies, patients }. Los campos que son solo
// de la vista (robots, velocidad, panel de colas) no se envían.
export function reset({ rooms, doctors, orderlies, patients }) {
  return request("POST", "/api/reset", { rooms, doctors, orderlies, patients });
}

export function addPatient() {
  return request("POST", "/api/patients", {});
}

// kind: "doctor" | "orderly"
export function addStaff(kind) {
  return request("POST", "/api/staff", { kind });
}

// locationId: valor numérico de hospital.Location (ver getLocations).
export function attack(patientId, locationId) {
  return request("POST", "/api/attacks", { patient: patientId, location: locationId });
}

export function wakeUp(patientId) {
  return request("POST", "/api/wakeups", { patient: patientId });
}

export function scenarioStart() {
  return request("POST", "/api/scenario/start", {});
}

export function scenarioNext() {
  return request("POST", "/api/scenario/next", {});
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    const err = new Error("No hay conexión con el servidor.");
    err.status = 0;
    err.cause = cause;
    throw err;
  }

  // El cuerpo debería ser JSON siempre, pero un 404 del servidor de
  // archivos o un proxy pueden devolver texto: no se revienta por eso.
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(data?.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
