package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"

	"objetosCostenos/demo"
	"objetosCostenos/hospital"
)

func main() {
	in := bufio.NewScanner(os.Stdin)

	for {
		fmt.Println()
		fmt.Println("=== " + demo.HospitalName + " ===")
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

// runScenario ejecuta la sección 6 del enunciado en el orden exigido.
func runScenario() error {
	h, err := demo.NewHospital()
	if err != nil {
		return err
	}

	printHeader("Escenario de demostración")
	fmt.Printf("  %d doctores, %d en el personal, %d habitaciones, %d pacientes\n",
		len(h.Doctors()), len(h.Staff()), len(h.Rooms()), len(h.Patients()))

	attacks := demo.Attacks(h)
	tono, wilfrido := attacks[0].Patient, attacks[3].Patient

	printHeader("Ataques de sueño")
	for _, a := range attacks {
		if err := registerAndPrint(h, a.Patient, a.Location); err != nil {
			return err
		}
	}

	printHallway(h.PatientsInHallway())
	if err := assignAndPrint(h, wilfrido); err != nil {
		return err
	}

	printHeader(fmt.Sprintf("%s se despierta", patientLabel(tono)))
	if err := wakeUpAndPrint(h, tono); err != nil {
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
// cama o de personal libre es un caso previsto: se muestra y se sigue;
// cualquier otro error se devuelve.
func registerAndPrint(h *hospital.Hospital, p *hospital.Patient, location hospital.Location) error {
	err := h.RegisterEpisode(p, location)
	if err != nil && !errors.Is(err, hospital.ErrNoRoomAvailable) && !errors.Is(err, hospital.ErrNoStaffAvailable) {
		return err
	}

	fmt.Printf("  %s se durmió en %s", patientLabel(p), location)
	if r := p.Room(); r != nil {
		fmt.Printf(" -> habitación %d", r.Number())
	}
	fmt.Println()
	if err != nil {
		for line := range strings.SplitSeq(err.Error(), "\n") {
			fmt.Println("    " + line)
		}
	}
	return nil
}

// wakeUpAndPrint despierta al paciente y muestra a quién le pasaron las colas
// la cama y el personal que quedaron libres.
func wakeUpAndPrint(h *hospital.Hospital, p *hospital.Patient) error {
	freed := p.Room()
	waitingRoom, waitingStaff := h.WaitingForRoom(), h.WaitingForStaff()
	if err := h.WakeUpPatient(p); err != nil {
		return err
	}

	fmt.Printf("  %s está despierto\n", patientLabel(p))
	if freed != nil {
		fmt.Printf("  libera la habitación %d\n", freed.Number())
	}
	for _, q := range waitingRoom {
		if r := q.Room(); r != nil {
			fmt.Printf("  %s sale de la cola de cama -> habitación %d\n", patientLabel(q), r.Number())
		}
	}
	for _, q := range waitingStaff {
		if q.IsAsleep() && !slices.Contains(h.WaitingForStaff(), q) {
			fmt.Printf("  %s sale de la cola de atención -> lo atiende %s\n", patientLabel(q), attenderOf(h, q))
		}
	}
	return nil
}

// attenderOf busca el último episodio del paciente en el historial.
func attenderOf(h *hospital.Hospital, p *hospital.Patient) string {
	for _, e := range slices.Backward(h.History()) {
		if e.Patient() == p && e.Attender() != nil {
			return e.Attender().Name()
		}
	}
	return "nadie"
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
