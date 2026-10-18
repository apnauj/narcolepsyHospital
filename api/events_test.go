package api

import (
	"slices"
	"testing"

	"objetosCostenos/hospital"
)

// awake y asleep arman pacientes para las fotos de prueba.
func awake(id string) PatientView {
	return PatientView{ID: id, State: hospital.Awake.String()}
}

func asleep(id string, location hospital.Location, room int, attendedBy string) PatientView {
	state := hospital.AsleepInHallway
	if room != 0 {
		state = hospital.AsleepInBed
	}
	return PatientView{ID: id, State: state.String(), Asleep: true, Location: int(location), Room: room, AttendedBy: attendedBy}
}

func staffViews(ids ...string) []StaffView {
	out := make([]StaffView, 0, len(ids))
	for _, id := range ids {
		out = append(out, StaffView{ID: id, Kind: KindDoctor})
	}
	return out
}

func TestDiff(t *testing.T) {
	const lobby, cafeteria = hospital.LocationLobby, hospital.LocationCafeteria

	tests := []struct {
		name          string
		before, after Snapshot
		want          []Event
	}{
		{
			name:   "sin cambios",
			before: Snapshot{Patients: []PatientView{awake("P-001")}, Staff: staffViews("D-01")},
			after:  Snapshot{Patients: []PatientView{awake("P-001")}, Staff: staffViews("D-01")},
			want:   []Event{},
		},
		{
			// Un solo comando no produce todo esto a la vez, pero sirve para
			// fijar el orden de los ocho grupos.
			name: "orden de los grupos",
			before: Snapshot{
				Patients: []PatientView{
					asleep("P-001", lobby, 101, "D-01"),
					asleep("P-002", cafeteria, 0, ""),
					awake("P-003"),
				},
				Staff:      staffViews("D-01"),
				RoomQueue:  []string{"P-002"},
				StaffQueue: []string{"P-002"},
			},
			after: Snapshot{
				Patients: []PatientView{
					awake("P-001"),
					asleep("P-002", cafeteria, 101, "D-01"),
					asleep("P-003", lobby, 0, ""),
					awake("P-004"),
				},
				Staff:      staffViews("D-01", "D-02"),
				RoomQueue:  []string{"P-003"},
				StaffQueue: []string{"P-003"},
			},
			want: []Event{
				{Type: EventPatientAdmitted, Patient: "P-004"},
				{Type: EventStaffHired, Staff: "D-02"},
				{Type: EventPatientWoke, Patient: "P-001", Room: 101, Staff: "D-01"},
				{Type: EventAttackStarted, Patient: "P-003", Location: int(lobby)},
				{Type: EventRoomAssigned, Patient: "P-002", Room: 101, FromQueue: true},
				{Type: EventQueuedForRoom, Patient: "P-003"},
				{Type: EventAttentionAssigned, Patient: "P-002", Staff: "D-01", FromQueue: true},
				{Type: EventQueuedForStaff, Patient: "P-003"},
			},
		},
		{
			// P-003 llegó a las colas antes que P-001: los de cola salen en el
			// orden de la cola y después el resto (P-002) por admisión.
			name: "fromQueue primero y en el orden de la cola",
			before: Snapshot{
				Patients: []PatientView{
					asleep("P-001", lobby, 0, ""),
					awake("P-002"),
					asleep("P-003", lobby, 0, ""),
				},
				RoomQueue:  []string{"P-003", "P-001"},
				StaffQueue: []string{"P-003", "P-001"},
			},
			after: Snapshot{
				Patients: []PatientView{
					asleep("P-001", lobby, 102, "D-02"),
					asleep("P-002", cafeteria, 103, "D-03"),
					asleep("P-003", lobby, 101, "D-01"),
				},
				RoomQueue:  []string{},
				StaffQueue: []string{},
			},
			want: []Event{
				{Type: EventAttackStarted, Patient: "P-002", Location: int(cafeteria)},
				{Type: EventRoomAssigned, Patient: "P-003", Room: 101, FromQueue: true},
				{Type: EventRoomAssigned, Patient: "P-001", Room: 102, FromQueue: true},
				{Type: EventRoomAssigned, Patient: "P-002", Room: 103},
				{Type: EventAttentionAssigned, Patient: "P-003", Staff: "D-01", FromQueue: true},
				{Type: EventAttentionAssigned, Patient: "P-001", Staff: "D-02", FromQueue: true},
				{Type: EventAttentionAssigned, Patient: "P-002", Staff: "D-03"},
			},
		},
		{
			name:   "cambio de quien atiende",
			before: Snapshot{Patients: []PatientView{asleep("P-001", lobby, 101, "D-01")}},
			after:  Snapshot{Patients: []PatientView{asleep("P-001", lobby, 101, "D-02")}},
			want:   []Event{{Type: EventAttentionAssigned, Patient: "P-001", Staff: "D-02"}},
		},
		{
			name:   "despierta sin cama ni personal",
			before: Snapshot{Patients: []PatientView{asleep("P-001", lobby, 0, "")}, RoomQueue: []string{"P-001"}, StaffQueue: []string{"P-001"}},
			after:  Snapshot{Patients: []PatientView{awake("P-001")}},
			want:   []Event{{Type: EventPatientWoke, Patient: "P-001"}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Diff(tt.before, tt.after)
			if got == nil {
				t.Fatal("Diff devolvió nil; debe ser una lista vacía para que el JSON salga []")
			}
			if !slices.Equal(got, tt.want) {
				t.Errorf("Diff =\n  %+v\nse esperaba\n  %+v", got, tt.want)
			}
		})
	}
}
