// Package api expone el hospital por HTTP para la interfaz gráfica. Es un
// adaptador: solo llama a métodos públicos del paquete hospital y traduce
// el resultado a JSON. El paquete hospital no sabe que esta capa existe.
package api

// Snapshot es la foto del estado público del hospital en un instante. La
// vista dibuja el panel de colas y los indicadores solo a partir de ella.
type Snapshot struct {
	Hospital   string        `json:"hospital"`
	Mode       string        `json:"mode"` // ModeFree o ModeScenario
	Rooms      []RoomView    `json:"rooms"`
	Staff      []StaffView   `json:"staff"`
	Patients   []PatientView `json:"patients"`
	RoomQueue  []string      `json:"roomQueue"`  // IDs en orden de llegada
	StaffQueue []string      `json:"staffQueue"` // IDs en orden de llegada
}

const (
	ModeFree     = "free"
	ModeScenario = "scenario"
)

type RoomView struct {
	Number    int      `json:"number"`
	State     string   `json:"state"`
	Capacity  int      `json:"capacity"`
	Occupants []string `json:"occupants"`
}

// Tipos de personal que entiende la vista.
const (
	KindDoctor  = "doctor"
	KindOrderly = "orderly"
	KindOther   = "other"
)

type StaffView struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	BusyWith string `json:"busyWith"` // ID del paciente que atiende, o ""
}

type PatientView struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Age        int    `json:"age"`
	Level      string `json:"level"`
	State      string `json:"state"`
	Asleep     bool   `json:"asleep"`
	Location   int    `json:"location"` // hospital.Location; 0 si está despierto
	Room       int    `json:"room"`     // número de habitación; 0 si no tiene
	AttendedBy string `json:"attendedBy"`
}

// LocationView es un valor válido de hospital.Location con su nombre.
type LocationView struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// Tipos de evento. Ver docs/gui/CONTRACT.md para su orden y significado.
const (
	EventPatientAdmitted   = "patientAdmitted"
	EventStaffHired        = "staffHired"
	EventPatientWoke       = "patientWoke"
	EventAttackStarted     = "attackStarted"
	EventRoomAssigned      = "roomAssigned"
	EventQueuedForRoom     = "queuedForRoom"
	EventAttentionAssigned = "attentionAssigned"
	EventQueuedForStaff    = "queuedForStaff"
)

// Event es un cambio entre dos fotos que la vista convierte en animación.
type Event struct {
	Type      string `json:"type"`
	Patient   string `json:"patient,omitempty"`
	Staff     string `json:"staff,omitempty"`
	Room      int    `json:"room,omitempty"`
	Location  int    `json:"location,omitempty"`
	FromQueue bool   `json:"fromQueue,omitempty"`
}

// Tipos de aviso: casos previstos que no son fallos.
const (
	NoticeNoRoom  = "noRoom"
	NoticeNoStaff = "noStaff"
)

type Notice struct {
	Kind    string `json:"kind"`
	Message string `json:"message"`
}

// Result es la respuesta de todo comando que cambia el hospital.
type Result struct {
	Snapshot Snapshot  `json:"snapshot"`
	Events   []Event   `json:"events"`
	Notices  []Notice  `json:"notices"`
	Step     *StepView `json:"step,omitempty"` // solo en el modo escenario
}

// StepView describe el paso del escenario que se acaba de ejecutar.
type StepView struct {
	Index int    `json:"index"` // empieza en 1
	Total int    `json:"total"`
	Title string `json:"title"`
	Done  bool   `json:"done"`
}

// Queries son las cuatro consultas de la sección 5 del enunciado.
type Queries struct {
	Hallway  []string         `json:"hallway"`  // 5.1: IDs dormidos en el pasillo
	Episodes []DoctorEpisodes `json:"episodes"` // 5.2
	Severe   []SevereCount    `json:"severe"`   // 5.4, ordenado por ID
}

type DoctorEpisodes struct {
	Doctor   string        `json:"doctor"`
	Episodes []EpisodeView `json:"episodes"`
}

type EpisodeView struct {
	ID       string `json:"id"`
	Date     string `json:"date"` // RFC 3339
	Patient  string `json:"patient"`
	Location int    `json:"location"`
	Room     int    `json:"room"`
	Attender string `json:"attender"` // "" si quedó sin atender
	Summary  string `json:"summary"`
}

type SevereCount struct {
	Patient  string `json:"patient"`
	Episodes int    `json:"episodes"`
}
