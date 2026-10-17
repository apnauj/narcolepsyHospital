package hospital

import (
	"errors"
	"fmt"
)

// Orderly es el camillero: atiende ataques llevando al paciente a la cama,
// pero no diagnostica, así que nunca toma pacientes a su cargo.
type Orderly struct {
	Person
}

func NewOrderly(id, name string, age int) (*Orderly, error) {
	person, err := newPerson(id, name, age)
	if err != nil {
		return nil, fmt.Errorf("camillero inválido: %w", err)
	}

	return &Orderly{Person: person}, nil
}

// Attend implementa Attender.
func (o *Orderly) Attend(p *Patient, location Location) (EpisodeRecord, error) {
	if p == nil {
		return EpisodeRecord{}, errors.New("no se puede atender un paciente nil")
	}
	if !p.IsAsleep() {
		return EpisodeRecord{}, fmt.Errorf("el paciente %s está despierto, no hay emergencia", p.ID())
	}

	return newEpisodeRecord(p, o, location), nil
}
