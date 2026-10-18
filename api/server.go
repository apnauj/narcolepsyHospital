package api

import (
	"encoding/json"
	"errors"
	"io"
	"math/rand/v2"
	"net/http"
	"sync"

	"objetosCostenos/demo"
	"objetosCostenos/hospital"
)

// maxBodyBytes limita el cuerpo de los comandos: ninguno necesita más.
const maxBodyBytes = 1 << 16

// Server guarda el hospital que se está mostrando. Su mutex serializa cada
// comando junto con las fotos de antes y después: el hospital ya es seguro
// para goroutines, pero sin este candado otra petición podría colarse entre
// el comando y la foto, y los eventos saldrían mezclados. También protege
// rng, que no es seguro para goroutines.
type Server struct {
	mu       sync.Mutex
	h        *hospital.Hospital
	mode     string
	rng      *rand.Rand
	gen      *generator
	scenario *scenario // nil en el modo libre
}

// New crea el servidor con el hospital del escenario, en modo libre.
func New() (*Server, error) {
	return newServer(rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64())))
}

// newServer deja elegir la fuente de azar, para que los tests sean repetibles.
func newServer(rng *rand.Rand) (*Server, error) {
	h, err := demo.NewHospital()
	if err != nil {
		return nil, err
	}
	return &Server{h: h, mode: ModeFree, rng: rng, gen: generatorFor(rng, h)}, nil
}

// Handler devuelve las rutas de la API, todas bajo /api/.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/state", s.handleState)
	mux.HandleFunc("GET /api/locations", s.handleLocations)
	mux.HandleFunc("GET /api/queries", s.handleQueries)
	mux.HandleFunc("POST /api/reset", s.handleReset)
	mux.HandleFunc("POST /api/patients", s.handlePatients)
	mux.HandleFunc("POST /api/staff", s.handleStaff)
	mux.HandleFunc("POST /api/attacks", s.handleAttacks)
	mux.HandleFunc("POST /api/wakeups", s.handleWakeUps)
	mux.HandleFunc("POST /api/scenario/start", s.handleScenarioStart)
	mux.HandleFunc("POST /api/scenario/next", s.handleScenarioNext)
	return mux
}

func (s *Server) handleState(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	snap := takeSnapshot(s.h, s.mode)
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, snap)
}

func (s *Server) handleLocations(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, locations())
}

func (s *Server) handleQueries(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.queries())
}

func (s *Server) handleReset(w http.ResponseWriter, r *http.Request) {
	var req ResetRequest
	if err := decode(w, r, &req); err != nil {
		respond(w, Result{}, err)
		return
	}
	res, err := s.reset(req)
	respond(w, res, err)
}

func (s *Server) handlePatients(w http.ResponseWriter, r *http.Request) {
	if err := decode(w, r, &struct{}{}); err != nil {
		respond(w, Result{}, err)
		return
	}
	res, err := s.addPatient()
	respond(w, res, err)
}

func (s *Server) handleStaff(w http.ResponseWriter, r *http.Request) {
	var req StaffRequest
	if err := decode(w, r, &req); err != nil {
		respond(w, Result{}, err)
		return
	}
	res, err := s.addStaff(req)
	respond(w, res, err)
}

func (s *Server) handleAttacks(w http.ResponseWriter, r *http.Request) {
	var req AttackRequest
	if err := decode(w, r, &req); err != nil {
		respond(w, Result{}, err)
		return
	}
	res, err := s.attack(req)
	respond(w, res, err)
}

func (s *Server) handleWakeUps(w http.ResponseWriter, r *http.Request) {
	var req WakeUpRequest
	if err := decode(w, r, &req); err != nil {
		respond(w, Result{}, err)
		return
	}
	res, err := s.wakeUp(req)
	respond(w, res, err)
}

func (s *Server) handleScenarioStart(w http.ResponseWriter, r *http.Request) {
	if err := decode(w, r, &struct{}{}); err != nil {
		respond(w, Result{}, err)
		return
	}
	res, err := s.startScenario()
	respond(w, res, err)
}

func (s *Server) handleScenarioNext(w http.ResponseWriter, r *http.Request) {
	if err := decode(w, r, &struct{}{}); err != nil {
		respond(w, Result{}, err)
		return
	}
	res, err := s.nextStep()
	respond(w, res, err)
}

// decode lee el cuerpo JSON de un comando. Un cuerpo vacío vale como {}.
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err := dec.Decode(v); err != nil && !errors.Is(err, io.EOF) {
		return badRequest("cuerpo JSON inválido: %v", err)
	}
	return nil
}

// respond contesta un comando: el Result si salió bien o el error con su
// código HTTP.
func respond(w http.ResponseWriter, res Result, err error) {
	if err != nil {
		writeError(w, statusOf(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeError responde {"error": "..."}: un comando que no se pudo hacer
// (paciente ya dormido, ID desconocido, datos inválidos).
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
