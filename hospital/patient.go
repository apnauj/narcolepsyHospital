package hospital

import (
	"errors"
	"fmt"
)

type Patient struct {
	Person
	narcolepsyLevel NarcolepsyLevel
	state           PatientState
	currentLocation Location
	room            *Room
	assignedDoctor  *Doctor
	contact         *EmergencyContact
	episodeCount    int
}

type PatientState int

const (
	Awake PatientState = iota
	AsleepInHallway
	AsleepInBed

	patientStateMax
)

func (s PatientState) String() string {
	names := [...]string{
		"Awake",
		"Asleep In Hallway",
		"Asleep In Bed",
	}

	if !s.IsValid() {
		return fmt.Sprintf("PatientState(%d)", s)
	}

	return names[s]
}

func (s PatientState) IsValid() bool {
	return s >= Awake && s < patientStateMax
}

type NarcolepsyLevel int

const (
	NarcolepsyUnknown NarcolepsyLevel = iota
	NarcolepsyMild
	NarcolepsyModerate
	NarcolepsySevere

	narcolepsyLevelMax
)

func (n NarcolepsyLevel) String() string {
	names := [...]string{
		"Unknown",
		"Mild",
		"Moderate",
		"Severe",
	}

	if !n.IsValid() {
		return fmt.Sprintf("NarcolepsyLevel(%d)", n)
	}

	return names[n]
}

func (n NarcolepsyLevel) IsValid() bool {
	return n > NarcolepsyUnknown && n < narcolepsyLevelMax
}

func NewPatient(id, name string, age int, level NarcolepsyLevel) (*Patient, error) {
	person, err := newPerson(id, name, age)
	if err != nil {
		return nil, fmt.Errorf("paciente inválido: %w", err)
	}
	if !level.IsValid() {
		return nil, fmt.Errorf("paciente inválido: nivel de narcolepsia %v", level)
	}

	return &Patient{Person: person, narcolepsyLevel: level, state: Awake}, nil
}

func (p *Patient) Level() NarcolepsyLevel              { return p.narcolepsyLevel }
func (p *Patient) State() PatientState                 { return p.state }
func (p *Patient) Location() Location                  { return p.currentLocation }
func (p *Patient) Room() *Room                         { return p.room }
func (p *Patient) AssignedDoctor() *Doctor             { return p.assignedDoctor }
func (p *Patient) EmergencyContact() *EmergencyContact { return p.contact }

func (p *Patient) SetEmergencyContact(c *EmergencyContact) error {
	if c == nil {
		return errors.New("el contacto de emergencia no puede ser nil")
	}
	p.contact = c
	return nil
}

func (p *Patient) IsAsleep() bool {
	return p.state != Awake
}

// SufferSleepAttack duerme al paciente donde esté. Queda en el pasillo hasta
// que el hospital le asigne una cama.
func (p *Patient) SufferSleepAttack(location Location) error {
	if !location.IsValid() {
		return fmt.Errorf("ubicación inválida: %v", location)
	}
	if p.IsAsleep() {
		return fmt.Errorf("el paciente %s ya está dormido", p.ID())
	}

	p.state = AsleepInHallway
	p.currentLocation = location
	p.episodeCount++
	return nil
}

// WakeUp despierta al paciente y libera su cama, si tenía una.
// No es seguro llamarlo desde varias goroutines; en ese caso se usa
// Hospital.WakeUpPatient, que lo protege con el mutex del hospital.
func (p *Patient) WakeUp() error {
	if !p.IsAsleep() {
		return fmt.Errorf("el paciente %s ya está despierto", p.ID())
	}

	if p.room != nil {
		if err := p.room.Release(p); err != nil {
			return fmt.Errorf("no se pudo liberar la habitación: %w", err)
		}
		p.room = nil
	}

	p.state = Awake
	return nil
}

func (p *Patient) moveToBed(r *Room) {
	p.room = r
	p.state = AsleepInBed
}
