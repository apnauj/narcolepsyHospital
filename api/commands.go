package api

import (
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"objetosCostenos/demo"
	"objetosCostenos/hospital"
)

// Rangos y límites de la sección 2 de docs/gui/CONTRACT.md.
const (
	minRooms, maxRooms = 2, 10
	maxDoctors         = 6
	maxOrderlies       = 6
	maxInitialPatients = 12

	maxPatients = 30 // con +Paciente
	maxStaff    = 12 // con +Doctor y +Camillero

	firstRoomNumber = 101
	roomCapacity    = 1
)

// statusError es un comando rechazado con el código HTTP que le toca. Los
// errores del hospital que no lo traen se responden con 409.
type statusError struct {
	status int
	err    error
}

func (e *statusError) Error() string { return e.err.Error() }
func (e *statusError) Unwrap() error { return e.err }

func badRequest(format string, args ...any) error {
	return &statusError{http.StatusBadRequest, fmt.Errorf(format, args...)}
}

func notFound(format string, args ...any) error {
	return &statusError{http.StatusNotFound, fmt.Errorf(format, args...)}
}

func conflict(format string, args ...any) error {
	return &statusError{http.StatusConflict, fmt.Errorf(format, args...)}
}

// statusOf da el código HTTP de un comando fallido.
func statusOf(err error) int {
	if se, ok := errors.AsType[*statusError](err); ok {
		return se.status
	}
	return http.StatusConflict
}

// change ejecuta un comando bajo s.mu, entre la foto de antes y la de
// después, y arma el Result con los eventos y los avisos. Si cmd falla por
// algo que no es un caso previsto, el comando entero falla.
func (s *Server) change(cmd func() error) (Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	before := takeSnapshot(s.h, s.mode)
	notices, err := splitNotices(cmd())
	if err != nil {
		return Result{}, err
	}
	after := takeSnapshot(s.h, s.mode)

	return Result{Snapshot: after, Events: Diff(before, after), Notices: notices}, nil
}

// load cambia el hospital entero. Comparar con el anterior no tiene sentido,
// así que el Result sale sin eventos. Se llama con s.mu tomado.
func (s *Server) load(h *hospital.Hospital, gen *generator, mode string, sc *scenario) Result {
	s.h, s.gen, s.mode, s.scenario = h, gen, mode, sc
	return Result{Snapshot: takeSnapshot(h, mode), Events: []Event{}, Notices: []Notice{}}
}

// splitNotices separa los casos previstos del resto de errores. Los errores
// del hospital pueden venir unidos con errors.Join; cada parte que es
// ErrNoRoomAvailable o ErrNoStaffAvailable se vuelve un aviso con su
// mensaje, y lo que sobre se devuelve como error.
func splitNotices(err error) ([]Notice, error) {
	notices := []Notice{}
	if err == nil {
		return notices, nil
	}

	parts := []error{err}
	if joined, ok := err.(interface{ Unwrap() []error }); ok {
		parts = joined.Unwrap()
	}

	var rest []error
	for _, part := range parts {
		switch {
		case errors.Is(part, hospital.ErrNoRoomAvailable):
			notices = append(notices, Notice{Kind: NoticeNoRoom, Message: part.Error()})
		case errors.Is(part, hospital.ErrNoStaffAvailable):
			notices = append(notices, Notice{Kind: NoticeNoStaff, Message: part.Error()})
		default:
			rest = append(rest, part)
		}
	}
	return notices, errors.Join(rest...)
}

func (r ResetRequest) validate() error {
	switch {
	case r.Rooms < minRooms || r.Rooms > maxRooms:
		return badRequest("rooms debe estar entre %d y %d (llegó %d)", minRooms, maxRooms, r.Rooms)
	case r.Doctors < 0 || r.Doctors > maxDoctors:
		return badRequest("doctors debe estar entre 0 y %d (llegó %d)", maxDoctors, r.Doctors)
	case r.Orderlies < 0 || r.Orderlies > maxOrderlies:
		return badRequest("orderlies debe estar entre 0 y %d (llegó %d)", maxOrderlies, r.Orderlies)
	case r.Patients < 0 || r.Patients > maxInitialPatients:
		return badRequest("patients debe estar entre 0 y %d (llegó %d)", maxInitialPatients, r.Patients)
	case r.Doctors+r.Orderlies < 1:
		return badRequest("hace falta al menos un doctor o un camillero para atender los ataques")
	}
	return nil
}

// reset arma un hospital nuevo con la configuración pedida y vuelve al modo
// libre. Los contadores de IDs empiezan de nuevo.
func (s *Server) reset(req ResetRequest) (Result, error) {
	if err := req.validate(); err != nil {
		return Result{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	gen := newGenerator(s.rng)
	h, err := buildHospital(req, gen)
	if err != nil {
		return Result{}, &statusError{http.StatusInternalServerError, fmt.Errorf("no se pudo armar el hospital: %w", err)}
	}
	return s.load(h, gen, ModeFree, nil), nil
}

// buildHospital contrata primero a los doctores y luego a los camilleros:
// ese es el orden del round-robin, igual que en demo.NewHospital.
func buildHospital(req ResetRequest, gen *generator) (*hospital.Hospital, error) {
	h, err := hospital.NewHospital(demo.HospitalName)
	if err != nil {
		return nil, err
	}

	for i := range req.Rooms {
		room, err := hospital.NewRoom(firstRoomNumber+i, roomCapacity)
		if err != nil {
			return nil, err
		}
		if err := h.AddRoom(room); err != nil {
			return nil, err
		}
	}
	for range req.Doctors {
		if err := hireDoctor(h, gen); err != nil {
			return nil, err
		}
	}
	for range req.Orderlies {
		if err := hireOrderly(h, gen); err != nil {
			return nil, err
		}
	}
	for range req.Patients {
		if err := admitPatient(h, gen); err != nil {
			return nil, err
		}
	}
	return h, nil
}

func hireDoctor(h *hospital.Hospital, gen *generator) error {
	d, err := gen.doctor()
	if err != nil {
		return err
	}
	return h.HireDoctor(d)
}

func hireOrderly(h *hospital.Hospital, gen *generator) error {
	o, err := gen.orderly()
	if err != nil {
		return err
	}
	return h.HireStaff(o)
}

func admitPatient(h *hospital.Hospital, gen *generator) error {
	p, err := gen.patient()
	if err != nil {
		return err
	}
	return h.AdmitPatient(p)
}

// requireFree rechaza los comandos manuales mientras corre el escenario,
// para que sus pasos den siempre el mismo resultado. Se llama con s.mu tomado.
func (s *Server) requireFree() error {
	if s.mode != ModeFree {
		return conflict("el escenario está en curso: solo se puede avanzar de paso o reiniciar")
	}
	return nil
}

// findPatient busca un paciente por ID. Se llama con s.mu tomado.
func (s *Server) findPatient(id string) (*hospital.Patient, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, badRequest("falta el ID del paciente")
	}
	for _, p := range s.h.Patients() {
		if p.ID() == id {
			return p, nil
		}
	}
	return nil, notFound("no hay ningún paciente con ID %s", id)
}

// addPatient es +Paciente: admite a alguien nuevo, despierto.
func (s *Server) addPatient() (Result, error) {
	return s.change(func() error {
		if err := s.requireFree(); err != nil {
			return err
		}
		if n := len(s.h.Patients()); n >= maxPatients {
			return conflict("el hospital ya tiene %d pacientes, el máximo", n)
		}
		return admitPatient(s.h, s.gen)
	})
}

// addStaff es +Doctor y +Camillero. Si alguien esperaba atención, el
// hospital se lo asigna de una vez al recién contratado.
func (s *Server) addStaff(req StaffRequest) (Result, error) {
	var hire func(*hospital.Hospital, *generator) error
	switch req.Kind {
	case KindDoctor:
		hire = hireDoctor
	case KindOrderly:
		hire = hireOrderly
	default:
		return Result{}, badRequest("kind debe ser %q o %q (llegó %q)", KindDoctor, KindOrderly, req.Kind)
	}

	return s.change(func() error {
		if err := s.requireFree(); err != nil {
			return err
		}
		if n := len(s.h.Staff()); n >= maxStaff {
			return conflict("el hospital ya tiene %d miembros del personal, el máximo", n)
		}
		return hire(s.h, s.gen)
	})
}

// attack registra un ataque de sueño. Quedarse sin cama o sin personal sale
// como aviso; un paciente que ya está dormido es un 409.
func (s *Server) attack(req AttackRequest) (Result, error) {
	location := hospital.Location(req.Location)
	if !location.IsValid() {
		return Result{}, badRequest("ubicación inválida: %d", req.Location)
	}

	return s.change(func() error {
		if err := s.requireFree(); err != nil {
			return err
		}
		p, err := s.findPatient(req.Patient)
		if err != nil {
			return err
		}
		return s.h.RegisterEpisode(p, location)
	})
}

// wakeUp despierta a un paciente; lo que libera pasa al siguiente de cada cola.
func (s *Server) wakeUp(req WakeUpRequest) (Result, error) {
	return s.change(func() error {
		if err := s.requireFree(); err != nil {
			return err
		}
		p, err := s.findPatient(req.Patient)
		if err != nil {
			return err
		}
		return s.h.WakeUpPatient(p)
	})
}

// scenario recorre, uno por uno, los pasos de la sección 6 del enunciado
// sobre el hospital de demo.NewHospital.
type scenario struct {
	steps []scenarioStep
	done  int // pasos ya ejecutados
}

type scenarioStep struct {
	title string
	run   func() error
}

// newScenario arma los pasos: los ataques de demo.Attacks, la consulta 5.3
// para el último atacado (que se quedó en el pasillo) y el despertar del
// primero, cuya cama y cuyo doctor pasan a las colas.
func newScenario(h *hospital.Hospital) (*scenario, error) {
	attacks := demo.Attacks(h)
	if len(attacks) == 0 {
		return nil, errors.New("el escenario no trae ataques")
	}

	sc := &scenario{}
	for i, a := range attacks {
		sc.steps = append(sc.steps, scenarioStep{
			title: fmt.Sprintf("Ataque %d: %s %s se duerme en %s", i+1, a.Patient.ID(), a.Patient.Name(), a.Location),
			run:   func() error { return h.RegisterEpisode(a.Patient, a.Location) },
		})
	}

	inHallway, first := attacks[len(attacks)-1].Patient, attacks[0].Patient
	sc.steps = append(sc.steps,
		scenarioStep{
			title: fmt.Sprintf("[5.3] Asignando habitación a %s", inHallway.ID()),
			run: func() error {
				_, err := h.AssignRoom(inHallway)
				return err
			},
		},
		scenarioStep{
			title: fmt.Sprintf("%s %s se despierta", first.ID(), first.Name()),
			run:   func() error { return h.WakeUpPatient(first) },
		},
	)
	return sc, nil
}

func (sc *scenario) view(title string) *StepView {
	return &StepView{Index: sc.done, Total: len(sc.steps), Title: title, Done: sc.done == len(sc.steps)}
}

// startScenario carga el hospital del escenario, sin ejecutar ningún paso.
func (s *Server) startScenario() (Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	h, err := demo.NewHospital()
	if err != nil {
		return Result{}, &statusError{http.StatusInternalServerError, err}
	}
	sc, err := newScenario(h)
	if err != nil {
		return Result{}, &statusError{http.StatusInternalServerError, err}
	}

	res := s.load(h, generatorFor(s.rng, h), ModeScenario, sc)
	res.Step = sc.view("Escenario de demostración")
	return res, nil
}

// nextStep ejecuta el siguiente paso del escenario.
func (s *Server) nextStep() (Result, error) {
	var step *StepView
	res, err := s.change(func() error {
		if s.mode != ModeScenario || s.scenario == nil {
			return conflict("no hay un escenario en curso")
		}
		sc := s.scenario
		if sc.done == len(sc.steps) {
			return conflict("el escenario ya terminó")
		}

		current := sc.steps[sc.done]
		sc.done++
		step = sc.view(current.title)
		return current.run()
	})
	if err != nil {
		return Result{}, err
	}

	res.Step = step
	return res, nil
}

// queries responde las consultas 5.1, 5.2 y 5.4 del enunciado.
func (s *Server) queries() Queries {
	s.mu.Lock()
	defer s.mu.Unlock()

	q := Queries{
		Hallway:  ids(s.h.PatientsInHallway()),
		Episodes: []DoctorEpisodes{},
		Severe:   []SevereCount{},
	}

	for _, d := range s.h.Doctors() {
		view := DoctorEpisodes{Doctor: d.ID(), Episodes: []EpisodeView{}}
		for _, e := range d.MyEpisodes() {
			view.Episodes = append(view.Episodes, episodeView(e))
		}
		q.Episodes = append(q.Episodes, view)
	}

	for p, n := range s.h.SevereReport() {
		q.Severe = append(q.Severe, SevereCount{Patient: p.ID(), Episodes: n})
	}
	// Un map no tiene orden; se ordena por ID para que la respuesta sea estable.
	slices.SortFunc(q.Severe, func(a, b SevereCount) int { return strings.Compare(a.Patient, b.Patient) })

	return q
}

func episodeView(e hospital.EpisodeRecord) EpisodeView {
	view := EpisodeView{
		ID:       e.ID(),
		Date:     e.Date().Format(time.RFC3339),
		Patient:  e.Patient().ID(),
		Location: int(e.Location()),
		Summary:  e.Summary(),
	}
	if r := e.Room(); r != nil {
		view.Room = r.Number()
	}
	if a := e.Attender(); a != nil {
		view.Attender = a.ID()
	}
	return view
}
