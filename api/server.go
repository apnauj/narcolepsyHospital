package api

import (
	"encoding/json"
	"net/http"
	"sync"

	"objetosCostenos/demo"
	"objetosCostenos/hospital"
)

// Server guarda el hospital que se está mostrando. Su mutex serializa cada
// comando junto con las fotos de antes y después: el hospital ya es seguro
// para goroutines, pero sin este candado otra petición podría colarse entre
// el comando y la foto, y los eventos saldrían mezclados.
type Server struct {
	mu   sync.Mutex
	h    *hospital.Hospital
	mode string
}

// New crea el servidor con el hospital del escenario, en modo libre.
func New() (*Server, error) {
	h, err := demo.NewHospital()
	if err != nil {
		return nil, err
	}
	return &Server{h: h, mode: ModeFree}, nil
}

// Handler devuelve las rutas de la API, todas bajo /api/.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/state", s.handleState)
	mux.HandleFunc("GET /api/locations", s.handleLocations)

	// Pendientes (ver docs/gui/CONTRACT.md).
	for _, route := range []string{
		"GET /api/queries",
		"POST /api/reset",
		"POST /api/patients",
		"POST /api/staff",
		"POST /api/attacks",
		"POST /api/wakeups",
		"POST /api/scenario/start",
		"POST /api/scenario/next",
	} {
		mux.HandleFunc(route, notImplemented)
	}
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

func notImplemented(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "todavía no implementado")
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
