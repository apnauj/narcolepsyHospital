package hospital

import (
	"errors"
	"fmt"
	"slices"
)

type Doctor struct {
	Person
	speciality        Speciality
	patientsUnderCare []*Patient
	episodes          []EpisodeRecord
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

func NewDoctor(id, name string, age int, speciality Speciality) (*Doctor, error) {
	person, err := newPerson(id, name, age)
	if err != nil {
		return nil, fmt.Errorf("doctor inválido: %w", err)
	}

	return &Doctor{Person: person, speciality: speciality}, nil
}

func (d *Doctor) Speciality() Speciality { return d.speciality }

func (d *Doctor) PatientsUnderCare() []*Patient {
	return slices.Clone(d.patientsUnderCare)
}

// MyEpisodes devuelve los episodios en los que intervino este doctor.
// La relación vive en el propio Doctor: no necesita consultar al hospital.
func (d *Doctor) MyEpisodes() []EpisodeRecord {
	return slices.Clone(d.episodes)
}

// DiagnosePatient deja al paciente a cargo de este doctor.
func (d *Doctor) DiagnosePatient(p *Patient) error {
	if p == nil {
		return errors.New("no se puede diagnosticar un paciente nil")
	}
	if p.assignedDoctor == d {
		return nil
	}
	if p.assignedDoctor != nil {
		return fmt.Errorf("el paciente %s ya está a cargo de %s", p.ID(), p.assignedDoctor.Name())
	}

	p.assignedDoctor = d
	d.patientsUnderCare = append(d.patientsUnderCare, p)
	return nil
}

// AttendSleepEmergency atiende a un paciente dormido. Si nadie lo tiene a
// cargo todavía, el doctor lo diagnostica y se queda con él.
func (d *Doctor) AttendSleepEmergency(p *Patient) error {
	if p == nil {
		return errors.New("no se puede atender un paciente nil")
	}
	if !p.IsAsleep() {
		return fmt.Errorf("el paciente %s está despierto, no hay emergencia", p.ID())
	}
	if p.assignedDoctor == nil {
		return d.DiagnosePatient(p)
	}
	return nil
}

// Attend implementa Attender.
func (d *Doctor) Attend(p *Patient, location Location) (EpisodeRecord, error) {
	if err := d.AttendSleepEmergency(p); err != nil {
		return EpisodeRecord{}, err
	}

	record := newEpisodeRecord(p, d, location)
	d.episodes = append(d.episodes, record)
	return record, nil
}
