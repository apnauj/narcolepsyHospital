package hospital

import (
	"errors"
	"fmt"
	"slices"
)

type Room struct {
	number    int
	capacity  int
	state     RoomState
	occupants []*Patient
}

type RoomState int

const (
	RoomStateUnknown RoomState = iota
	RoomAvailable
	RoomOccupied

	roomStateMax
)

func (r RoomState) String() string {
	names := [...]string{
		"Unknown",
		"Available",
		"Occupied",
	}

	if !r.IsValid() {
		return fmt.Sprintf("RoomState(%d)", r)
	}

	return names[r]
}

func (r RoomState) IsValid() bool {
	return r > RoomStateUnknown && r < roomStateMax
}

func NewRoom(number, capacity int) (*Room, error) {
	if number <= 0 {
		return nil, errors.New("el número de habitación debe ser positivo")
	}
	if capacity <= 0 {
		return nil, errors.New("la capacidad de la habitación debe ser positiva")
	}

	return &Room{number: number, capacity: capacity, state: RoomAvailable}, nil
}

func (r *Room) Number() int      { return r.number }
func (r *Room) Capacity() int    { return r.capacity }
func (r *Room) State() RoomState { return r.state }

// Occupants devuelve una copia para que nadie modifique la lista desde fuera.
func (r *Room) Occupants() []*Patient {
	return slices.Clone(r.occupants)
}

// IsAvailable indica si queda al menos una cama libre.
func (r *Room) IsAvailable() bool {
	return len(r.occupants) < r.capacity
}

// Occupy acuesta al paciente en la habitación. Solo actualiza la habitación;
// el cambio de estado del paciente lo coordina Hospital.AssignRoom.
func (r *Room) Occupy(p *Patient) error {
	if p == nil {
		return errors.New("no se puede ocupar una habitación con un paciente nil")
	}
	if slices.Contains(r.occupants, p) {
		return fmt.Errorf("el paciente %s ya está en la habitación %d", p.ID(), r.number)
	}
	if !r.IsAvailable() {
		return fmt.Errorf("la habitación %d está llena", r.number)
	}

	r.occupants = append(r.occupants, p)
	r.updateState()
	return nil
}

// Release saca al paciente de la habitación y la deja disponible.
func (r *Room) Release(p *Patient) error {
	i := slices.Index(r.occupants, p)
	if i < 0 {
		return fmt.Errorf("el paciente no está en la habitación %d", r.number)
	}

	r.occupants = slices.Delete(r.occupants, i, i+1)
	r.updateState()
	return nil
}

func (r *Room) updateState() {
	if r.IsAvailable() {
		r.state = RoomAvailable
	} else {
		r.state = RoomOccupied
	}
}
