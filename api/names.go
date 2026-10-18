package api

import (
	"fmt"
	"math/rand/v2"

	"objetosCostenos/hospital"
)

// Nombres y apellidos comunes en el Caribe colombiano. Son nombres de gente
// de verdad, de los que se oyen en cualquier barrio de la costa: nada de
// apodos que se burlen de nadie.
var (
	firstNames = []string{
		"Yeimy", "Wilfrido", "Nayeli", "Kelly Johana", "Toño", "Chucho",
		"Yarelis", "Dairo", "Yuranis", "Éder", "Leidys", "Hernando",
		"Arelis", "Euclides", "Etilvia", "Ovidio", "Yesenia", "Marlon",
		"Rosalba", "Emiro", "Luz Dary", "Aníbal", "Yulieth", "Moncho",
		"Ana Milena", "Fredy", "Petrona", "Jhon Jairo", "Nelly", "Dagoberto",
		"Maribel", "Abelardo", "Deisy", "Wílmer", "Ledys", "Edilberto",
		"Yolima", "Cristóbal", "Nicolasa", "Juancho",
	}
	lastNames = []string{
		"Berrío", "Padilla", "Polo", "Barraza", "Cassiani", "Mendoza",
		"Torres", "Mercado", "Pertuz", "Orozco", "Vergara", "Julio",
		"Villalba", "Herrera", "Ballesteros", "Carrascal", "De la Hoz", "Zúñiga",
		"Cantillo", "Arrieta", "Salcedo", "Fontalvo", "Charris", "Pacheco",
		"Meza", "Ahumada", "Batista", "Caraballo", "Payares", "Pimienta",
		"Marimón", "Escorcia", "Barrios", "Rada", "Ospino", "Guerrero",
		"Cervantes", "Navarro", "Montero", "Salas",
	}
)

// Edades razonables: pacientes adultos y personal en edad de trabajar.
const (
	minPatientAge, maxPatientAge = 18, 85
	minStaffAge, maxStaffAge     = 24, 64
)

// maxNameTries limita los intentos de no repetir un nombre. Con las listas
// de arriba casi siempre basta el primero; si no, se acepta el repetido.
const maxNameTries = 20

// generator inventa los pacientes y el personal nuevos. Lleva los contadores
// de IDs, que solo suben, y los nombres ya usados. La fuente de azar es la
// del servidor, para que los tests puedan sembrarla.
type generator struct {
	rng       *rand.Rand
	taken     map[string]bool
	patients  int // último número usado en P-001, P-002...
	doctors   int // último número usado en D-01, D-02...
	orderlies int // último número usado en O-01, O-02...
}

func newGenerator(rng *rand.Rand) *generator {
	return &generator{rng: rng, taken: make(map[string]bool)}
}

// generatorFor sigue la numeración de un hospital armado por otro lado
// (el de demo.NewHospital), para que los IDs nuevos no choquen.
func generatorFor(rng *rand.Rand, h *hospital.Hospital) *generator {
	g := newGenerator(rng)
	for _, p := range h.Patients() {
		g.taken[p.Name()] = true
		g.patients++
	}
	for _, a := range h.Staff() {
		g.taken[a.Name()] = true
		switch kindOf(a) {
		case KindDoctor:
			g.doctors++
		case KindOrderly:
			g.orderlies++
		}
	}
	return g
}

func (g *generator) patient() (*hospital.Patient, error) {
	g.patients++
	id := fmt.Sprintf("P-%03d", g.patients)
	return hospital.NewPatient(id, g.name(), g.between(minPatientAge, maxPatientAge), g.level())
}

func (g *generator) doctor() (*hospital.Doctor, error) {
	g.doctors++
	id := fmt.Sprintf("D-%02d", g.doctors)
	return hospital.NewDoctor(id, g.name(), g.between(minStaffAge, maxStaffAge), g.speciality())
}

func (g *generator) orderly() (*hospital.Orderly, error) {
	g.orderlies++
	id := fmt.Sprintf("O-%02d", g.orderlies)
	return hospital.NewOrderly(id, g.name(), g.between(minStaffAge, maxStaffAge))
}

// name arma «nombre apellido» al azar, tratando de no repetir uno que ya
// tenga alguien del hospital.
func (g *generator) name() string {
	var name string
	for range maxNameTries {
		name = pick(g.rng, firstNames) + " " + pick(g.rng, lastNames)
		if !g.taken[name] {
			break
		}
	}
	g.taken[name] = true
	return name
}

func (g *generator) level() hospital.NarcolepsyLevel {
	return hospital.NarcolepsyLevel(g.between(int(hospital.NarcolepsyMild), int(hospital.NarcolepsySevere)))
}

// speciality elige entre las especialidades conocidas (sin Unknown).
func (g *generator) speciality() hospital.Speciality {
	return hospital.Speciality(g.between(int(hospital.SpecialityCardiology), int(hospital.SpecialityGeneralMedicine)))
}

// between devuelve un entero al azar en [lo, hi].
func (g *generator) between(lo, hi int) int {
	return lo + g.rng.IntN(hi-lo+1)
}

func pick(rng *rand.Rand, options []string) string {
	return options[rng.IntN(len(options))]
}
