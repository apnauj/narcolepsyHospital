package hospital_test

import (
	"errors"
	"testing"
	"time"

	"objetosCostenos/hospital"
)

// newTestHospital crea un hospital con un doctor, un camillero y `rooms`
// habitaciones de capacidad 1 (101, 102, ...).
func newTestHospital(t *testing.T, rooms int) (*hospital.Hospital, *hospital.Doctor) {
	t.Helper()

	h, err := hospital.NewHospital("Hospital de prueba")
	if err != nil {
		t.Fatal(err)
	}

	d, err := hospital.NewDoctor("D-01", "Karen Ospina", 40, hospital.SpecialityNeurology)
	if err != nil {
		t.Fatal(err)
	}
	if err := h.HireDoctor(d); err != nil {
		t.Fatal(err)
	}

	o, err := hospital.NewOrderly("O-01", "Chucho Barraza", 30)
	if err != nil {
		t.Fatal(err)
	}
	if err := h.HireStaff(o); err != nil {
		t.Fatal(err)
	}

	for i := range rooms {
		r, err := hospital.NewRoom(101+i, 1)
		if err != nil {
			t.Fatal(err)
		}
		if err := h.AddRoom(r); err != nil {
			t.Fatal(err)
		}
	}

	return h, d
}

func admit(t *testing.T, h *hospital.Hospital, id string, level hospital.NarcolepsyLevel) *hospital.Patient {
	t.Helper()

	p, err := hospital.NewPatient(id, "Paciente "+id, 30, level)
	if err != nil {
		t.Fatal(err)
	}
	if err := h.AdmitPatient(p); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestAssignRoomWithFreeRoom(t *testing.T) {
	h, _ := newTestHospital(t, 1)
	p := admit(t, h, "P-001", hospital.NarcolepsyMild)

	if err := p.SufferSleepAttack(hospital.LocationCafeteria); err != nil {
		t.Fatal(err)
	}

	room, err := h.AssignRoom(p)
	if err != nil {
		t.Fatalf("AssignRoom devolvió error: %v", err)
	}
	if room.Number() != 101 {
		t.Errorf("habitación = %d, se esperaba 101", room.Number())
	}
	if room.State() != hospital.RoomOccupied {
		t.Errorf("estado de la habitación = %v, se esperaba Occupied", room.State())
	}
	if p.State() != hospital.AsleepInBed {
		t.Errorf("estado del paciente = %v, se esperaba AsleepInBed", p.State())
	}
	if p.Room() != room {
		t.Error("el paciente no quedó asociado a la habitación")
	}
}

func TestAssignRoomWithoutFreeRoom(t *testing.T) {
	h, _ := newTestHospital(t, 1)
	first := admit(t, h, "P-001", hospital.NarcolepsyMild)
	second := admit(t, h, "P-002", hospital.NarcolepsySevere)

	for _, p := range []*hospital.Patient{first, second} {
		if err := p.SufferSleepAttack(hospital.LocationLobby); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := h.AssignRoom(first); err != nil {
		t.Fatal(err)
	}

	room, err := h.AssignRoom(second)
	if !errors.Is(err, hospital.ErrNoRoomAvailable) {
		t.Fatalf("error = %v, se esperaba ErrNoRoomAvailable", err)
	}
	if room != nil {
		t.Errorf("se devolvió la habitación %d cuando no había ninguna libre", room.Number())
	}
	if second.State() != hospital.AsleepInHallway {
		t.Errorf("estado del paciente = %v, se esperaba AsleepInHallway", second.State())
	}
}

func TestPatientsInHallway(t *testing.T) {
	h, _ := newTestHospital(t, 1)
	inBed := admit(t, h, "P-001", hospital.NarcolepsyMild)
	inHallway := admit(t, h, "P-002", hospital.NarcolepsyModerate)
	admit(t, h, "P-003", hospital.NarcolepsyMild) // sigue despierto

	if err := h.RegisterEpisode(inBed, hospital.LocationCafeteria); err != nil {
		t.Fatal(err)
	}
	if err := h.RegisterEpisode(inHallway, hospital.LocationLobby); !errors.Is(err, hospital.ErrNoRoomAvailable) {
		t.Fatalf("error = %v, se esperaba ErrNoRoomAvailable", err)
	}

	got := h.PatientsInHallway()
	if len(got) != 1 || got[0] != inHallway {
		t.Fatalf("PatientsInHallway = %v, se esperaba solo P-002", got)
	}
}

func TestWakeUpGivesRoomToNextInQueue(t *testing.T) {
	h, _ := newTestHospital(t, 1)
	sleeper := admit(t, h, "P-001", hospital.NarcolepsyMild)
	first := admit(t, h, "P-002", hospital.NarcolepsySevere)
	second := admit(t, h, "P-003", hospital.NarcolepsyMild)

	if err := h.RegisterEpisode(sleeper, hospital.LocationCafeteria); err != nil {
		t.Fatal(err)
	}
	for _, p := range []*hospital.Patient{first, second} {
		if err := h.RegisterEpisode(p, hospital.LocationLobby); !errors.Is(err, hospital.ErrNoRoomAvailable) {
			t.Fatalf("error = %v, se esperaba ErrNoRoomAvailable", err)
		}
	}

	if err := h.WakeUpPatient(sleeper); err != nil {
		t.Fatal(err)
	}
	if room := first.Room(); room == nil || room.Number() != 101 || first.State() != hospital.AsleepInBed {
		t.Fatalf("P-002 llegó primero a la cola: debería estar en la 101 (estado %v)", first.State())
	}
	if q := h.WaitingForRoom(); len(q) != 1 || q[0] != second {
		t.Errorf("cola de cama = %v, se esperaba solo P-003", q)
	}
	if sleeper.State() != hospital.Awake || sleeper.Room() != nil {
		t.Error("el paciente que despertó debería estar Awake y sin habitación")
	}

	// Si quien espera se despierta, sale de la cola y la cama queda libre.
	for _, p := range []*hospital.Patient{second, first} {
		if err := h.WakeUpPatient(p); err != nil {
			t.Fatal(err)
		}
	}
	if q := h.WaitingForRoom(); len(q) != 0 {
		t.Errorf("cola de cama = %v, debería quedar vacía", q)
	}
	if r := h.Rooms()[0]; r.State() != hospital.RoomAvailable {
		t.Errorf("la habitación 101 quedó %v, se esperaba Available", r.State())
	}
}

func TestDoctorMyEpisodes(t *testing.T) {
	// Con un doctor y un camillero, el round-robin alterna: doctor, camillero, doctor.
	// P-001 se despierta antes del tercer ataque para que el doctor quede libre.
	h, doctor := newTestHospital(t, 3)
	patients := []*hospital.Patient{
		admit(t, h, "P-001", hospital.NarcolepsyMild),
		admit(t, h, "P-002", hospital.NarcolepsyMild),
		admit(t, h, "P-003", hospital.NarcolepsyMild),
	}
	steps := []func() error{
		func() error { return h.RegisterEpisode(patients[0], hospital.LocationLobby) },
		func() error { return h.RegisterEpisode(patients[1], hospital.LocationLobby) },
		func() error { return h.WakeUpPatient(patients[0]) },
		func() error { return h.RegisterEpisode(patients[2], hospital.LocationLobby) },
	}
	for _, step := range steps {
		if err := step(); err != nil {
			t.Fatal(err)
		}
	}

	episodes := doctor.MyEpisodes()
	if len(episodes) != 2 {
		t.Fatalf("el doctor tiene %d episodios, se esperaban 2", len(episodes))
	}
	if episodes[0].Patient() != patients[0] || episodes[1].Patient() != patients[2] {
		t.Errorf("episodios del doctor para %s y %s, se esperaban P-001 y P-003",
			episodes[0].Patient().ID(), episodes[1].Patient().ID())
	}
}

func TestDispatchSkipsBusyStaff(t *testing.T) {
	// El doctor sigue con P-001 dormido; aunque le toca el turno, el tercer
	// ataque debe ir al camillero, que quedó libre cuando despertó P-002.
	h, doctor := newTestHospital(t, 3)
	busy := admit(t, h, "P-001", hospital.NarcolepsyMild)
	woke := admit(t, h, "P-002", hospital.NarcolepsyMild)
	next := admit(t, h, "P-003", hospital.NarcolepsyMild)

	steps := []func() error{
		func() error { return h.RegisterEpisode(busy, hospital.LocationLobby) },
		func() error { return h.RegisterEpisode(woke, hospital.LocationLobby) },
		func() error { return h.WakeUpPatient(woke) },
		func() error { return h.RegisterEpisode(next, hospital.LocationLobby) },
	}
	for _, step := range steps {
		if err := step(); err != nil {
			t.Fatal(err)
		}
	}

	history := h.History()
	if got := history[len(history)-1].Attender().ID(); got != "O-01" {
		t.Errorf("el tercer ataque lo atendió %s, se esperaba el camillero O-01", got)
	}
	if n := len(doctor.MyEpisodes()); n != 1 {
		t.Errorf("el doctor tiene %d episodios, se esperaba 1", n)
	}
}

func TestNoStaffAvailable(t *testing.T) {
	h, _ := newTestHospital(t, 3)
	first := admit(t, h, "P-001", hospital.NarcolepsyMild)
	second := admit(t, h, "P-002", hospital.NarcolepsyMild)
	unattended := admit(t, h, "P-003", hospital.NarcolepsySevere)

	for _, p := range []*hospital.Patient{first, second} {
		if err := h.RegisterEpisode(p, hospital.LocationLobby); err != nil {
			t.Fatal(err)
		}
	}

	err := h.RegisterEpisode(unattended, hospital.LocationCafeteria)
	if !errors.Is(err, hospital.ErrNoStaffAvailable) {
		t.Fatalf("error = %v, se esperaba ErrNoStaffAvailable", err)
	}

	history := h.History()
	if len(history) != 3 {
		t.Fatalf("historial con %d episodios, se esperaban 3", len(history))
	}
	if last := history[2]; last.Patient() != unattended || last.Attender() != nil {
		t.Error("el episodio sin personal libre debería quedar registrado y sin atender")
	}
	if unattended.State() != hospital.AsleepInBed {
		t.Errorf("estado = %v; la falta de personal no debería quitarle la cama libre", unattended.State())
	}
	if q := h.WaitingForStaff(); len(q) != 1 || q[0] != unattended {
		t.Errorf("cola de atención = %v, se esperaba solo P-003", q)
	}
}

func TestWakeUpFreesStaffForNextInQueue(t *testing.T) {
	h, doctor := newTestHospital(t, 3)
	first := admit(t, h, "P-001", hospital.NarcolepsyMild)
	second := admit(t, h, "P-002", hospital.NarcolepsyMild)
	waiting := admit(t, h, "P-003", hospital.NarcolepsySevere)

	for _, p := range []*hospital.Patient{first, second} {
		if err := h.RegisterEpisode(p, hospital.LocationLobby); err != nil {
			t.Fatal(err)
		}
	}
	if err := h.RegisterEpisode(waiting, hospital.LocationCafeteria); !errors.Is(err, hospital.ErrNoStaffAvailable) {
		t.Fatalf("error = %v, se esperaba ErrNoStaffAvailable", err)
	}

	// El doctor atendía a P-001: al despertar este, queda libre para P-003.
	if err := h.WakeUpPatient(first); err != nil {
		t.Fatal(err)
	}
	if q := h.WaitingForStaff(); len(q) != 0 {
		t.Errorf("cola de atención = %v, debería quedar vacía", q)
	}

	history := h.History()
	if len(history) != 3 {
		t.Fatalf("historial con %d episodios, se esperaban 3 (se reemplaza, no se agrega)", len(history))
	}
	if a := history[2].Attender(); history[2].Patient() != waiting || a == nil || a.ID() != "D-01" {
		t.Errorf("el episodio de P-003 debería quedar atendido por D-01, got %v", a)
	}
	if episodes := doctor.MyEpisodes(); len(episodes) != 2 || episodes[1].Patient() != waiting {
		t.Error("el doctor debería tener los episodios de P-001 y P-003")
	}
}

func TestSevereReport(t *testing.T) {
	h, _ := newTestHospital(t, 3)
	twice := admit(t, h, "P-001", hospital.NarcolepsySevere)
	never := admit(t, h, "P-002", hospital.NarcolepsySevere)
	mild := admit(t, h, "P-003", hospital.NarcolepsyMild)

	steps := []func() error{
		func() error { return h.RegisterEpisode(twice, hospital.LocationLobby) },
		func() error { return h.WakeUpPatient(twice) },
		func() error { return h.RegisterEpisode(twice, hospital.LocationPharmacy) },
		func() error { return h.RegisterEpisode(mild, hospital.LocationCafeteria) },
	}
	for _, step := range steps {
		if err := step(); err != nil {
			t.Fatal(err)
		}
	}

	report := h.SevereReport()
	if len(report) != 2 {
		t.Fatalf("el reporte tiene %d pacientes, se esperaban 2 (solo los Severe)", len(report))
	}
	if report[twice] != 2 {
		t.Errorf("P-001 tiene %d episodios, se esperaban 2", report[twice])
	}
	if n, ok := report[never]; !ok || n != 0 {
		t.Errorf("P-002 debería aparecer con 0 episodios, got %d (presente=%v)", n, ok)
	}
}

func TestSimulateKeepsStateConsistent(t *testing.T) {
	// Pensado para correr con: go test -race ./...
	h, _ := newTestHospital(t, 3)
	ids := []string{"P-001", "P-002", "P-003", "P-004", "P-005"}
	for _, id := range ids {
		admit(t, h, id, hospital.NarcolepsySevere)
	}

	const attacks = 20
	for _, err := range h.Simulate(attacks, time.Millisecond) {
		if !errors.Is(err, hospital.ErrNoRoomAvailable) && !errors.Is(err, hospital.ErrNoStaffAvailable) {
			t.Errorf("error inesperado en la simulación: %v", err)
		}
	}

	if got, want := len(h.History()), attacks*len(ids); got != want {
		t.Errorf("historial con %d episodios, se esperaban %d", got, want)
	}
	for _, r := range h.Rooms() {
		if len(r.Occupants()) != 0 || r.State() != hospital.RoomAvailable {
			t.Errorf("la habitación %d debería quedar libre al final", r.Number())
		}
	}
	for _, p := range h.Patients() {
		if p.State() != hospital.Awake {
			t.Errorf("%s terminó en estado %v, se esperaba Awake", p.ID(), p.State())
		}
	}
	if len(h.WaitingForRoom()) != 0 || len(h.WaitingForStaff()) != 0 {
		t.Error("las colas deberían quedar vacías al final")
	}
}
