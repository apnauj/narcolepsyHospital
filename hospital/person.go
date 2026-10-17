package hospital

import (
	"errors"
	"strings"
)

// Person agrupa los datos de identidad que comparten pacientes y personal.
// Se embebe por valor en Patient, Doctor y Orderly, que heredan sus métodos.
type Person struct {
	id   string
	name string
	age  int
}

func newPerson(id, name string, age int) (Person, error) {
	id = strings.TrimSpace(id)
	name = strings.TrimSpace(name)

	if id == "" {
		return Person{}, errors.New("el id no puede estar vacío")
	}
	if name == "" {
		return Person{}, errors.New("el nombre no puede estar vacío")
	}
	if age < 0 {
		return Person{}, errors.New("la edad no puede ser negativa")
	}

	return Person{id: id, name: name, age: age}, nil
}

func (p Person) ID() string   { return p.id }
func (p Person) Name() string { return p.name }
func (p Person) Age() int     { return p.age }
