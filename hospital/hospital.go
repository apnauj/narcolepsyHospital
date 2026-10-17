package hospital

import (
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"
)

// ErrNoRoomAvailable indica que no quedaba ninguna cama libre. Es un caso
// previsto: el paciente se queda en el pasillo y el programa sigue.
var ErrNoRoomAvailable = errors.New("no hay habitación disponible")

// Hospital es seguro para usar desde varias goroutines: todos sus métodos
// exportados toman mu, así que dos asignaciones simultáneas se serializan.
type Hospital struct {
	mu           sync.Mutex
	name         string
	doctors      []*Doctor
	staff        []Attender
	patients     []*Patient
	rooms        []*Room
	history      []EpisodeRecord
	nextAttender int // turno del round-robin sobre staff
}

func NewHospital(name string) (*Hospital, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("el hospital necesita un nombre")
	}

	return &Hospital{name: name}, nil
}

func (h *Hospital) Name() string { return h.name }

func (h *Hospital) Patients() []*Patient {
	h.mu.Lock()
	defer h.mu.Unlock()

	return slices.Clone(h.patients)
}

func (h *Hospital) Doctors() []*Doctor {
	h.mu.Lock()
	defer h.mu.Unlock()

	return slices.Clone(h.doctors)
}

func (h *Hospital) Staff() []Attender {
	h.mu.Lock()
	defer h.mu.Unlock()

	return slices.Clone(h.staff)
}

func (h *Hospital) Rooms() []*Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	return slices.Clone(h.rooms)
}

func (h *Hospital) History() []EpisodeRecord {
	h.mu.Lock()
	defer h.mu.Unlock()

	return slices.Clone(h.history)
}

func (h *Hospital) AdmitPatient(p *Patient) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if p == nil {
		return errors.New("no se puede admitir un paciente nil")
	}
	if slices.ContainsFunc(h.patients, func(q *Patient) bool { return q.ID() == p.ID() }) {
		return fmt.Errorf("ya hay un paciente con id %s", p.ID())
	}

	h.patients = append(h.patients, p)
	return nil
}

// HireDoctor contrata a un doctor: queda en la lista de doctores y, como
// cualquier Attender, en el personal que atiende emergencias.
func (h *Hospital) HireDoctor(d *Doctor) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if d == nil {
		return errors.New("no se puede contratar un doctor nil")
	}
	if err := h.hire(d); err != nil {
		return err
	}

	h.doctors = append(h.doctors, d)
	return nil
}

// HireStaff contrata a cualquier Attender (camillero, enfermera...).
func (h *Hospital) HireStaff(a Attender) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if a == nil {
		return errors.New("no se puede contratar personal nil")
	}

	return h.hire(a)
}

func (h *Hospital) hire(a Attender) error {
	if slices.ContainsFunc(h.staff, func(s Attender) bool { return s.ID() == a.ID() }) {
		return fmt.Errorf("ya hay personal con id %s", a.ID())
	}

	h.staff = append(h.staff, a)
	return nil
}

func (h *Hospital) AddRoom(r *Room) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if r == nil {
		return errors.New("no se puede registrar una habitación nil")
	}
	if slices.ContainsFunc(h.rooms, func(q *Room) bool { return q.Number() == r.Number() }) {
		return fmt.Errorf("ya existe la habitación %d", r.Number())
	}

	h.rooms = append(h.rooms, r)
	return nil
}

// AssignRoom acuesta a un paciente dormido en el pasillo en la primera
// habitación libre. Si no hay ninguna devuelve ErrNoRoomAvailable y el
// paciente sigue en AsleepInHallway.
func (h *Hospital) AssignRoom(p *Patient) (*Room, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	return h.assignRoom(p)
}

func (h *Hospital) assignRoom(p *Patient) (*Room, error) {
	if err := h.checkAdmitted(p); err != nil {
		return nil, err
	}
	if p.state != AsleepInHallway {
		return nil, fmt.Errorf("el paciente %s no está dormido en el pasillo (estado: %v)", p.ID(), p.state)
	}

	for _, r := range h.rooms {
		if !r.IsAvailable() {
			continue
		}
		if err := r.Occupy(p); err != nil {
			return nil, err
		}
		p.moveToBed(r)
		return r, nil
	}

	return nil, fmt.Errorf("%w para %s: se queda en el pasillo", ErrNoRoomAvailable, p.ID())
}

// RegisterEpisode procesa un ataque de sueño completo: el paciente se duerme,
// se intenta darle cama, se despacha a alguien del personal y se guarda el
// registro en el historial.
//
// Si no hubo cama, el episodio igual queda registrado y se devuelve un error
// que cumple errors.Is(err, ErrNoRoomAvailable).
func (h *Hospital) RegisterEpisode(p *Patient, location Location) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if err := h.checkAdmitted(p); err != nil {
		return err
	}
	if len(h.staff) == 0 {
		return errors.New("no hay personal para atender el ataque")
	}
	if err := p.SufferSleepAttack(location); err != nil {
		return err
	}

	_, roomErr := h.assignRoom(p)

	record, err := h.dispatch(p, location)
	if err != nil {
		return err
	}
	h.history = append(h.history, record)

	return roomErr
}

// dispatch reparte los ataques por turnos (round-robin) sin mirar el tipo
// concreto de cada Attender. Si uno no puede atender, prueba con el siguiente.
func (h *Hospital) dispatch(p *Patient, location Location) (EpisodeRecord, error) {
	var errs []error
	for range len(h.staff) {
		a := h.staff[h.nextAttender]
		h.nextAttender = (h.nextAttender + 1) % len(h.staff)

		record, err := a.Attend(p, location)
		if err == nil {
			return record, nil
		}
		errs = append(errs, fmt.Errorf("%s: %w", a.Name(), err))
	}

	return EpisodeRecord{}, fmt.Errorf("nadie pudo atender a %s: %w", p.ID(), errors.Join(errs...))
}

// WakeUpPatient despierta a un paciente del hospital y libera su cama.
func (h *Hospital) WakeUpPatient(p *Patient) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if err := h.checkAdmitted(p); err != nil {
		return err
	}

	return p.WakeUp()
}

// PatientsInHallway devuelve los pacientes dormidos sin cama, para poder
// mandarles un camillero.
func (h *Hospital) PatientsInHallway() []*Patient {
	h.mu.Lock()
	defer h.mu.Unlock()

	var inHallway []*Patient
	for _, p := range h.patients {
		if p.state == AsleepInHallway {
			inHallway = append(inHallway, p)
		}
	}
	return inHallway
}

// SevereReport cruza los pacientes de nivel Severe con el historial y
// devuelve cuántos episodios tuvo cada uno hoy (incluye los que tienen 0).
func (h *Hospital) SevereReport() map[*Patient]int {
	h.mu.Lock()
	defer h.mu.Unlock()

	report := make(map[*Patient]int)
	for _, p := range h.patients {
		if p.narcolepsyLevel == NarcolepsySevere {
			report[p] = 0
		}
	}

	now := time.Now()
	for _, e := range h.history {
		if _, severe := report[e.patient]; severe && sameDay(e.date, now) {
			report[e.patient]++
		}
	}
	return report
}

func (h *Hospital) checkAdmitted(p *Patient) error {
	if p == nil {
		return errors.New("paciente nil")
	}
	if !slices.Contains(h.patients, p) {
		return fmt.Errorf("el paciente %s no está admitido en %s", p.ID(), h.name)
	}
	return nil
}

func sameDay(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}
