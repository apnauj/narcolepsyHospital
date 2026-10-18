package main

import (
	"bufio"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"objetosCostenos/hospital"
)

// simulationDelay es la espera máxima entre eventos de cada goroutine.
const simulationDelay = 20 * time.Millisecond

// runMenu trabaja sobre un hospital recién armado con los datos del escenario.
func runMenu(in *bufio.Scanner) error {
	h, err := newDemoHospital()
	if err != nil {
		return err
	}

	for {
		fmt.Println()
		fmt.Println("--- Menú interactivo ---")
		fmt.Println("1. Ver estado del hospital")
		fmt.Println("2. Registrar ataque de sueño")
		fmt.Println("3. Despertar paciente")
		fmt.Println("4. Asignar habitación a paciente del pasillo   [5.3]")
		fmt.Println("5. Pacientes dormidos en el pasillo            [5.1]")
		fmt.Println("6. Episodios por doctor                        [5.2]")
		fmt.Println("7. Reporte de severidad                        [5.4]")
		fmt.Println("8. Simulación concurrente")
		fmt.Println("0. Volver")

		choice, ok := readInt(in, "> ", 0, 8)
		if !ok || choice == 0 {
			return nil
		}

		switch choice {
		case 1:
			printStatus(h)
		case 2:
			err = menuSleepAttack(in, h)
		case 3:
			err = menuWakeUp(in, h)
		case 4:
			err = menuAssignRoom(in, h)
		case 5:
			printHallway(h.PatientsInHallway())
		case 6:
			for _, d := range h.Doctors() {
				printDoctorEpisodes(d)
			}
		case 7:
			printSevereReport(h.SevereReport())
		case 8:
			menuSimulation(in, h)
		}

		// Los errores de las operaciones se muestran y el menú sigue: son
		// casos previstos (paciente ya dormido, etc.), no fallos del programa.
		if err != nil {
			fmt.Println("  error:", err)
			err = nil
		}
	}
}

func printStatus(h *hospital.Hospital) {
	printHeader("Pacientes")
	for _, p := range h.Patients() {
		room, doctor := "-", "-"
		if r := p.Room(); r != nil {
			room = strconv.Itoa(r.Number())
		}
		if d := p.AssignedDoctor(); d != nil {
			doctor = d.Name()
		}
		location := "-"
		if p.IsAsleep() {
			location = p.Location().String()
		}
		fmt.Printf("  %s  %-20s %-9s %-18s %-20s hab: %-4s doctor: %s\n",
			p.ID(), p.Name(), p.Level(), p.State(), location, room, doctor)
	}

	printHeader("Habitaciones")
	for _, r := range h.Rooms() {
		names := make([]string, 0, r.Capacity())
		for _, p := range r.Occupants() {
			names = append(names, p.ID())
		}
		fmt.Printf("  %d  %-10s ocupantes: %d/%d %s\n",
			r.Number(), r.State(), len(names), r.Capacity(), strings.Join(names, ", "))
	}

	printHeader("Personal")
	for _, a := range h.Staff() {
		fmt.Printf("  %s  %s\n", a.ID(), a.Name())
	}
}

func menuSleepAttack(in *bufio.Scanner, h *hospital.Hospital) error {
	var awake []*hospital.Patient
	for _, p := range h.Patients() {
		if !p.IsAsleep() {
			awake = append(awake, p)
		}
	}

	p, ok := choosePatient(in, "¿Quién se duerme?", awake)
	if !ok {
		return nil
	}
	location, ok := chooseLocation(in)
	if !ok {
		return nil
	}

	return registerAndPrint(h, p, location)
}

func menuWakeUp(in *bufio.Scanner, h *hospital.Hospital) error {
	var asleep []*hospital.Patient
	for _, p := range h.Patients() {
		if p.IsAsleep() {
			asleep = append(asleep, p)
		}
	}

	p, ok := choosePatient(in, "¿Quién se despierta?", asleep)
	if !ok {
		return nil
	}

	if err := h.WakeUpPatient(p); err != nil {
		return err
	}
	fmt.Printf("  %s está despierto\n", patientLabel(p))
	return nil
}

func menuAssignRoom(in *bufio.Scanner, h *hospital.Hospital) error {
	p, ok := choosePatient(in, "¿A quién se le busca cama?", h.PatientsInHallway())
	if !ok {
		return nil
	}

	return assignAndPrint(h, p)
}

func menuSimulation(in *bufio.Scanner, h *hospital.Hospital) {
	attacks, ok := readInt(in, "¿Cuántos ataques por paciente? (1-50): ", 1, 50)
	if !ok {
		return
	}

	before := len(h.History())
	fmt.Printf("  lanzando %d goroutines...\n", len(h.Patients()))
	errs := h.Simulate(attacks, simulationDelay)

	withoutRoom, withoutStaff := 0, 0
	for _, err := range errs {
		noRoom := errors.Is(err, hospital.ErrNoRoomAvailable)
		noStaff := errors.Is(err, hospital.ErrNoStaffAvailable)
		if noRoom {
			withoutRoom++
		}
		if noStaff {
			withoutStaff++
		}
		if !noRoom && !noStaff {
			fmt.Println("  error:", err)
		}
	}
	fmt.Printf("  %d episodios nuevos, %d sin cama disponible, %d sin personal libre\n",
		len(h.History())-before, withoutRoom, withoutStaff)

	printSevereReport(h.SevereReport())
}

// choosePatient muestra una lista numerada; 0 o EOF cancelan.
func choosePatient(in *bufio.Scanner, question string, patients []*hospital.Patient) (*hospital.Patient, bool) {
	if len(patients) == 0 {
		fmt.Println("  no hay pacientes para esta opción")
		return nil, false
	}

	fmt.Println(question)
	for i, p := range patients {
		fmt.Printf("  %d. %s (%s)\n", i+1, patientLabel(p), p.State())
	}
	fmt.Println("  0. Cancelar")

	choice, ok := readInt(in, "> ", 0, len(patients))
	if !ok || choice == 0 {
		return nil, false
	}
	return patients[choice-1], true
}

func chooseLocation(in *bufio.Scanner) (hospital.Location, bool) {
	fmt.Println("¿Dónde?")
	const columns = 3
	for l := hospital.LocationUnknown + 1; l.IsValid(); l++ {
		fmt.Printf("  %2d. %-22s", int(l), l)
		if int(l)%columns == 0 {
			fmt.Println()
		}
	}
	fmt.Println()

	last := int(hospital.LocationMortuary)
	choice, ok := readInt(in, "> ", 1, last)
	if !ok {
		return hospital.LocationUnknown, false
	}
	return hospital.Location(choice), true
}

// readInt pide un número en [lo, hi] hasta que sea válido. Devuelve false
// si se acaba la entrada (EOF), para que el programa pueda terminar limpio.
func readInt(in *bufio.Scanner, prompt string, lo, hi int) (int, bool) {
	for {
		fmt.Print(prompt)
		if !in.Scan() {
			fmt.Println()
			return 0, false
		}

		n, err := strconv.Atoi(strings.TrimSpace(in.Text()))
		if err == nil && n >= lo && n <= hi {
			return n, true
		}
		fmt.Printf("  escribe un número entre %d y %d\n", lo, hi)
	}
}
