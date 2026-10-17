package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"

	"objetosCostenos/hospital"
)

const hospitalName = "Hospital de los Costeños con Narcolepsia"

func main() {
	in := bufio.NewScanner(os.Stdin)

	for {
		fmt.Println()
		fmt.Println("=== " + hospitalName + " ===")
		fmt.Println("1. Escenario de demostración (sección 6 del enunciado)")
		fmt.Println("2. Menú interactivo")
		fmt.Println("0. Salir")

		choice, ok := readInt(in, "Elige una opción: ", 0, 2)
		if !ok || choice == 0 {
			return
		}

		switch choice {
		case 1:
			if err := runScenario(); err != nil {
				fmt.Fprintln(os.Stderr, "error en el escenario:", err)
				os.Exit(1)
			}
		case 2:
			if err := runMenu(in); err != nil {
				fmt.Fprintln(os.Stderr, "error en el menú:", err)
				os.Exit(1)
			}
		}
	}
}

// newDemoHospital arma el hospital del escenario: 2 doctores, 1 camillero,
// 3 habitaciones de capacidad 1 y 5 pacientes (dos de ellos Severe).
func newDemoHospital() (*hospital.Hospital, error) {
	h, err := hospital.NewHospital(hospitalName)
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

// runScenario ejecuta la sección 6 del enunciado en el orden exigido.
func runScenario() error {
	h, err := newDemoHospital()
	if err != nil {
		return err
	}

	printHeader("Escenario de demostración")
	fmt.Printf("  %d doctores, %d en el personal, %d habitaciones, %d pacientes\n",
		len(h.Doctors()), len(h.Staff()), len(h.Rooms()), len(h.Patients()))

	patients := h.Patients()
	tono, yeimy, kelly, wilfrido := patients[0], patients[1], patients[2], patients[3]

	printHeader("Ataques de sueño")
	attacks := []struct {
		patient  *hospital.Patient
		location hospital.Location
	}{
		{tono, hospital.LocationCafeteria},
		{yeimy, hospital.LocationRadiologyDepartment},
		{kelly, hospital.LocationWaitingRoom},
		{wilfrido, hospital.LocationMainHallway},
	}
	for _, a := range attacks {
		if err := registerAndPrint(h, a.patient, a.location); err != nil {
			return err
		}
	}

	printHallway(h.PatientsInHallway())

	printHeader(fmt.Sprintf("%s se despierta", patientLabel(tono)))
	freed := tono.Room()
	if err := h.WakeUpPatient(tono); err != nil {
		return err
	}
	if freed != nil {
		fmt.Printf("  libera la habitación %d\n", freed.Number())
	}

	if err := assignAndPrint(h, wilfrido); err != nil {
		return err
	}

	printHeader("Resultados de las consultas")
	printHallway(h.PatientsInHallway())
	for _, d := range h.Doctors() {
		printDoctorEpisodes(d)
	}
	printSevereReport(h.SevereReport())
	return nil
}

// registerAndPrint registra un ataque e imprime el resultado. La falta de
// cama es un caso previsto: se muestra y se sigue; cualquier otro error se
// devuelve.
func registerAndPrint(h *hospital.Hospital, p *hospital.Patient, location hospital.Location) error {
	err := h.RegisterEpisode(p, location)
	switch {
	case errors.Is(err, hospital.ErrNoRoomAvailable):
		fmt.Printf("  %s se durmió en %s: %v\n", patientLabel(p), location, err)
		return nil
	case err != nil:
		return err
	}

	fmt.Printf("  %s se durmió en %s -> habitación %d\n", patientLabel(p), location, p.Room().Number())
	return nil
}

// assignAndPrint muestra la consulta 5.3 para un paciente del pasillo.
func assignAndPrint(h *hospital.Hospital, p *hospital.Patient) error {
	printHeader(fmt.Sprintf("[5.3] Asignando habitación a %s", p.ID()))

	room, err := h.AssignRoom(p)
	switch {
	case errors.Is(err, hospital.ErrNoRoomAvailable):
		fmt.Printf("  %v\n", err)
		return nil
	case err != nil:
		return err
	}

	fmt.Printf("  %s -> habitación %d\n", patientLabel(p), room.Number())
	return nil
}

func printHeader(title string) {
	fmt.Printf("\n== %s ==\n", title)
}

func patientLabel(p *hospital.Patient) string {
	return fmt.Sprintf("%s %s", p.ID(), p.Name())
}

func printHallway(patients []*hospital.Patient) {
	printHeader("[5.1] Pacientes dormidos en el pasillo")
	if len(patients) == 0 {
		fmt.Println("  (ninguno)")
		return
	}
	for _, p := range patients {
		fmt.Printf("  %s  %-20s (%s)\n", p.ID(), p.Name(), p.Location())
	}
}

func printDoctorEpisodes(d *hospital.Doctor) {
	printHeader(fmt.Sprintf("[5.2] Episodios atendidos por %s", d.Name()))
	episodes := d.MyEpisodes()
	if len(episodes) == 0 {
		fmt.Println("  (ninguno)")
		return
	}
	for _, e := range episodes {
		fmt.Println("  " + e.Summary())
	}
}

func printSevereReport(report map[*hospital.Patient]int) {
	printHeader("[5.4] Reporte de severidad (pacientes Severe)")
	if len(report) == 0 {
		fmt.Println("  (ninguno)")
		return
	}

	// Un map no tiene orden; se ordena por ID para que la salida sea estable.
	patients := make([]*hospital.Patient, 0, len(report))
	for p := range report {
		patients = append(patients, p)
	}
	slices.SortFunc(patients, func(a, b *hospital.Patient) int {
		return strings.Compare(a.ID(), b.ID())
	})

	for _, p := range patients {
		fmt.Printf("  %s  %-20s %d episodio(s) hoy\n", p.ID(), p.Name(), report[p])
	}
}
