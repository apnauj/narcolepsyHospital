package hospital

import (
	"errors"
	"strings"
)

// EmergencyContact es la persona a la que se avisa cuando un paciente sufre
// un ataque. Debe tener al menos un canal: email o teléfono.
type EmergencyContact struct {
	name  string
	email string
	phone string
}

func NewEmergencyContact(name, email, phone string) (*EmergencyContact, error) {
	name = strings.TrimSpace(name)
	email = strings.TrimSpace(email)
	phone = strings.TrimSpace(phone)

	if name == "" {
		return nil, errors.New("el contacto de emergencia necesita un nombre")
	}
	if email == "" && phone == "" {
		return nil, errors.New("el contacto de emergencia necesita un email o un teléfono")
	}

	return &EmergencyContact{name: name, email: email, phone: phone}, nil
}

func (c *EmergencyContact) Name() string  { return c.name }
func (c *EmergencyContact) Email() string { return c.email }
func (c *EmergencyContact) Phone() string { return c.phone }
