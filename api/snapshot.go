package api

import (
	"slices"

	"objetosCostenos/hospital"
)

// takeSnapshot arma la foto con los getters públicos del hospital. Quién
// atiende a quién no es público, pero se deduce del historial: el último
// episodio de un paciente dormido es el de su ataque actual.
func takeSnapshot(h *hospital.Hospital, mode string) Snapshot {
	s := Snapshot{
		Hospital:   h.Name(),
		Mode:       mode,
		RoomQueue:  ids(h.WaitingForRoom()),
		StaffQueue: ids(h.WaitingForStaff()),
	}

	for _, r := range h.Rooms() {
		s.Rooms = append(s.Rooms, RoomView{
			Number:    r.Number(),
			State:     r.State().String(),
			Capacity:  r.Capacity(),
			Occupants: ids(r.Occupants()),
		})
	}

	history := h.History()
	attendedBy := make(map[string]string) // paciente -> personal
	for _, p := range h.Patients() {
		view := PatientView{
			ID:     p.ID(),
			Name:   p.Name(),
			Age:    p.Age(),
			Level:  p.Level().String(),
			State:  p.State().String(),
			Asleep: p.IsAsleep(),
		}
		if p.IsAsleep() {
			view.Location = int(p.Location())
			if a := currentAttender(history, p); a != nil {
				view.AttendedBy = a.ID()
				attendedBy[p.ID()] = a.ID()
			}
		}
		if r := p.Room(); r != nil {
			view.Room = r.Number()
		}
		s.Patients = append(s.Patients, view)
	}

	for _, a := range h.Staff() {
		view := StaffView{ID: a.ID(), Name: a.Name(), Kind: kindOf(a)}
		for patient, staff := range attendedBy {
			if staff == a.ID() {
				view.BusyWith = patient
			}
		}
		s.Staff = append(s.Staff, view)
	}

	return s
}

func currentAttender(history []hospital.EpisodeRecord, p *hospital.Patient) hospital.Attender {
	for _, e := range slices.Backward(history) {
		if e.Patient() == p {
			return e.Attender()
		}
	}
	return nil
}

// kindOf es el único lugar donde la vista mira el tipo concreto del
// personal: solo para elegir cómo dibujarlo.
func kindOf(a hospital.Attender) string {
	switch a.(type) {
	case *hospital.Doctor:
		return KindDoctor
	case *hospital.Orderly:
		return KindOrderly
	default:
		return KindOther
	}
}

func ids(patients []*hospital.Patient) []string {
	out := make([]string, 0, len(patients))
	for _, p := range patients {
		out = append(out, p.ID())
	}
	return out
}

// locations lista todos los valores válidos de hospital.Location.
func locations() []LocationView {
	var out []LocationView
	for l := hospital.LocationUnknown + 1; l.IsValid(); l++ {
		out = append(out, LocationView{ID: int(l), Name: l.String()})
	}
	return out
}
