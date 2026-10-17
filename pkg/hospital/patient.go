package hospital

import "fmt"

type Patient struct {
	Person
	narcolepsyLevel string
	state           *PatientState
	currentLocation *Location
	assignedDoctor  *Doctor
	contact         *EmergencyContact
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
