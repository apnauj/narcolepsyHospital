// Package demo arma los datos del escenario de la sección 6 del enunciado.
// Lo usan el programa de consola y la interfaz gráfica, para que los dos
// muestren exactamente el mismo hospital.
package demo

import "objetosCostenos/hospital"

const HospitalName = "Hospital de los Costeños con Narcolepsia"

// Attack es un ataque de sueño del escenario: quién se duerme y dónde.
type Attack struct {
	Patient  *hospital.Patient
	Location hospital.Location
}

// NewHospital arma el hospital del escenario: 2 doctores, 1 camillero,
// 3 habitaciones de capacidad 1 y 5 pacientes (dos de ellos Severe).
func NewHospital() (*hospital.Hospital, error) {
	h, err := hospital.NewHospital(HospitalName)
	if err != nil {
		return nil, err
	}

	doctors := []struct {
		id, name   string
		age        int
		speciality hospital.Speciality
	}{
		{"D-01", "Karen Ospina", 45, hospital.SpecialityNeurology},
		{"D-02", "Álvaro Cassiani", 52, hospital.SpecialityGeneralMedicine},
	}
	for _, d := range doctors {
		doctor, err := hospital.NewDoctor(d.id, d.name, d.age, d.speciality)
		if err != nil {
			return nil, err
		}
		if err := h.HireDoctor(doctor); err != nil {
			return nil, err
		}
	}

	orderly, err := hospital.NewOrderly("O-01", "Chucho Barraza", 33)
	if err != nil {
		return nil, err
	}
	if err := h.HireStaff(orderly); err != nil {
		return nil, err
	}

	for _, number := range []int{101, 102, 103} {
		room, err := hospital.NewRoom(number, 1)
		if err != nil {
			return nil, err
		}
		if err := h.AddRoom(room); err != nil {
			return nil, err
		}
	}

	patients := []struct {
		id, name string
		age      int
		level    hospital.NarcolepsyLevel
	}{
		{"P-001", "Toño Mendoza", 58, hospital.NarcolepsyModerate},
		{"P-002", "Yeimy Padilla", 34, hospital.NarcolepsySevere},
		{"P-003", "Kelly Johana Torres", 27, hospital.NarcolepsyMild},
		{"P-004", "Wilfrido Berrío", 61, hospital.NarcolepsySevere},
		{"P-005", "Nayeli Polo", 45, hospital.NarcolepsyModerate},
	}
	for _, p := range patients {
		patient, err := hospital.NewPatient(p.id, p.name, p.age, p.level)
		if err != nil {
			return nil, err
		}
		if err := h.AdmitPatient(patient); err != nil {
			return nil, err
		}
	}

	return h, nil
}

// Attacks devuelve los cuatro ataques del escenario, en orden, para un
// hospital creado con NewHospital. Los tres primeros consiguen cama; el
// cuarto (Wilfrido) se queda en el pasillo. Después se despierta el
// primero (Toño) y las colas le pasan a Wilfrido lo que se libera.
func Attacks(h *hospital.Hospital) []Attack {
	p := h.Patients()
	return []Attack{
		{p[0], hospital.LocationCafeteria},
		{p[1], hospital.LocationRadiologyDepartment},
		{p[2], hospital.LocationWaitingRoom},
		{p[3], hospital.LocationMainHallway},
	}
}
