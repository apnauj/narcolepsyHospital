package hospital

type Doctor struct {
	Person
	speciality        Speciality
	patientsUnderCare []*Patient
	episodes          []*Episode
	attended          []*Episode
}

type Speciality int

const (
	SpecialityUnknown Speciality = iota
	SpecialityCardiology
	SpecialityNeurology
	SpecialityPediatrics
	SpecialityOncology
	SpecialityGeneralMedicine
)

func (s Speciality) String() string {
	names := [...]string{
		"Unknown",
		"Cardiology",
		"Neurology",
		"Pediatrics",
		"Oncology",
		"General Medicine",
	}

	if s < SpecialityUnknown || int(s) >= len(names) {
		return "Unknown"
	}

	return names[s]
}
