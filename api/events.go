package api

import "slices"

// Diff compara la foto de antes y la de después de un comando y devuelve los
// cambios como eventos, en el orden fijo de la sección 4 de
// docs/gui/CONTRACT.md. Es una función pura: no toca el hospital ni las fotos.
//
// Un paciente que no estaba en before cuenta como despierto y sin cama.
func Diff(before, after Snapshot) []Event {
	prev := make(map[string]PatientView, len(before.Patients))
	for _, p := range before.Patients {
		prev[p.ID] = p
	}

	events := []Event{}

	// 1. Admisiones.
	for _, p := range after.Patients {
		if _, ok := prev[p.ID]; !ok {
			events = append(events, Event{Type: EventPatientAdmitted, Patient: p.ID})
		}
	}

	// 2. Contrataciones.
	for _, a := range after.Staff {
		if !slices.ContainsFunc(before.Staff, func(b StaffView) bool { return b.ID == a.ID }) {
			events = append(events, Event{Type: EventStaffHired, Staff: a.ID})
		}
	}

	// 3. Despertares: la cama y el personal son los que tenía antes.
	for _, p := range after.Patients {
		if old := prev[p.ID]; old.Asleep && !p.Asleep {
			events = append(events, Event{Type: EventPatientWoke, Patient: p.ID, Room: old.Room, Staff: old.AttendedBy})
		}
	}

	// 4. Ataques.
	for _, p := range after.Patients {
		if !prev[p.ID].Asleep && p.Asleep {
			events = append(events, Event{Type: EventAttackStarted, Patient: p.ID, Location: p.Location})
		}
	}

	// 5. Camas.
	gotRoom := func(p PatientView) bool {
		old := prev[p.ID]
		return p.Asleep && p.Room != 0 && (old.Room == 0 || !old.Asleep)
	}
	events = appendAssigned(events, after.Patients, before.RoomQueue, gotRoom, func(p PatientView, fromQueue bool) Event {
		return Event{Type: EventRoomAssigned, Patient: p.ID, Room: p.Room, FromQueue: fromQueue}
	})

	// 6. Cola de cama.
	events = appendQueued(events, EventQueuedForRoom, before.RoomQueue, after.RoomQueue)

	// 7. Atención.
	gotStaff := func(p PatientView) bool {
		return p.AttendedBy != "" && p.AttendedBy != prev[p.ID].AttendedBy
	}
	events = appendAssigned(events, after.Patients, before.StaffQueue, gotStaff, func(p PatientView, fromQueue bool) Event {
		return Event{Type: EventAttentionAssigned, Patient: p.ID, Staff: p.AttendedBy, FromQueue: fromQueue}
	})

	// 8. Cola de atención.
	return appendQueued(events, EventQueuedForStaff, before.StaffQueue, after.StaffQueue)
}

// appendAssigned agrega un evento por cada paciente que cumple assigned:
// primero los que venían de queue, en el orden de esa cola, y después el
// resto por orden de admisión.
func appendAssigned(events []Event, patients []PatientView, queue []string,
	assigned func(PatientView) bool, event func(p PatientView, fromQueue bool) Event) []Event {
	byID := make(map[string]PatientView, len(patients))
	for _, p := range patients {
		byID[p.ID] = p
	}

	for _, id := range queue {
		if p, ok := byID[id]; ok && assigned(p) {
			events = append(events, event(p, true))
		}
	}
	for _, p := range patients {
		if assigned(p) && !slices.Contains(queue, p.ID) {
			events = append(events, event(p, false))
		}
	}
	return events
}

// appendQueued agrega un evento por cada ID que entró a la cola, en el
// orden de la cola nueva.
func appendQueued(events []Event, eventType string, before, after []string) []Event {
	for _, id := range after {
		if !slices.Contains(before, id) {
			events = append(events, Event{Type: eventType, Patient: id})
		}
	}
	return events
}
