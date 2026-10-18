// Datos de prueba compartidos por los tests ui-*: el hospital del caso de
// prueba después del paso 4 (Wilfrido en las dos colas).

export const LOCATIONS = [
  { id: 1, name: "Main Entrance" },
  { id: 3, name: "Reception" },
  { id: 5, name: "Waiting Room" },
  { id: 6, name: "Main Hallway" },
  { id: 9, name: "East Hallway" },
  { id: 13, name: "Pediatrics Hallway" },
  { id: 30, name: "Radiology Department" },
  { id: 34, name: "Cafeteria" },
  { id: 35, name: "Administrative Block" },
  { id: 36, name: "Maintenance Area" },
];

export function snapshot() {
  return {
    hospital: "Hospital de los Costeños con Narcolepsia",
    mode: "scenario",
    rooms: [
      { number: 101, state: "Occupied", capacity: 1, occupants: ["P-001"] },
      { number: 102, state: "Occupied", capacity: 1, occupants: ["P-002"] },
      { number: 103, state: "Occupied", capacity: 1, occupants: ["P-003"] },
    ],
    staff: [
      { id: "D-01", name: "Karen Ospina", kind: "doctor", busyWith: "P-001" },
      { id: "D-02", name: "Álvaro Cassiani", kind: "doctor", busyWith: "P-002" },
      { id: "O-01", name: "Chucho Barraza", kind: "orderly", busyWith: "P-003" },
    ],
    patients: [
      { id: "P-001", name: "Toño Mendoza", age: 58, level: "Moderate", state: "Asleep In Bed", asleep: true, location: 34, room: 101, attendedBy: "D-01" },
      { id: "P-002", name: "Yeimy Padilla", age: 34, level: "Severe", state: "Asleep In Bed", asleep: true, location: 30, room: 102, attendedBy: "D-02" },
      { id: "P-003", name: "Kelly Johana Torres", age: 27, level: "Mild", state: "Asleep In Bed", asleep: true, location: 5, room: 103, attendedBy: "O-01" },
      { id: "P-004", name: "Wilfrido Berrío", age: 61, level: "Severe", state: "Asleep In Hallway", asleep: true, location: 6, room: 0, attendedBy: "" },
      { id: "P-005", name: "Nayeli Polo", age: 45, level: "Moderate", state: "Awake", asleep: false, location: 0, room: 0, attendedBy: "" },
    ],
    roomQueue: ["P-004"],
    staffQueue: ["P-004"],
  };
}
