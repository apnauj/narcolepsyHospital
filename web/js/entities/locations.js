// Nombres de hospital.Location por su valor numérico (el `location` de
// PatientView). Solo se usa para ubicar en su zona a un paciente que ya llega
// dormido en el snapshot (sync); un test los compara con hospital/location.go.

export const LOCATION_NAMES = Object.freeze([
  "Unknown",
  "Main Entrance", "Emergency Entrance", "Reception", "Lobby", "Waiting Room",
  "Main Hallway", "North Hallway", "South Hallway", "East Hallway", "West Hallway",
  "ICU Hallway", "Surgical Hallway", "Pediatrics Hallway",
  "North Wing", "South Wing", "East Wing", "West Wing", "Central Tower",
  "Basement", "Ground Floor", "First Floor", "Second Floor", "Third Floor", "Roof Helipad",
  "Operating Room Block", "Recovery Unit", "ICU Area", "NICU Area", "Emergency Ward",
  "Radiology Department", "Laboratory Zone", "Blood Bank", "Pharmacy",
  "Cafeteria", "Administrative Block", "Maintenance Area", "Sterilization Unit", "Mortuary",
]);

/** Nombre de una Location numérica, o null si no es válida. */
export function locationName(id) {
  return Number.isInteger(id) && id > 0 && id < LOCATION_NAMES.length ? LOCATION_NAMES[id] : null;
}
