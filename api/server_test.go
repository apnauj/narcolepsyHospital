package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"

	"objetosCostenos/hospital"
)

// testAPI es un servidor de verdad sobre httptest, con la fuente de azar
// sembrada para que los nombres generados se repitan entre corridas.
type testAPI struct {
	t   *testing.T
	srv *Server
	ts  *httptest.Server
}

func newTestAPI(t *testing.T) *testAPI {
	t.Helper()

	srv, err := newServer(rand.New(rand.NewPCG(1, 2)))
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return &testAPI{t: t, srv: srv, ts: ts}
}

// do manda una petición y devuelve el código y el cuerpo crudo. Un body
// string se manda tal cual (para probar JSON inválido); cualquier otro se
// serializa.
func (a *testAPI) do(method, path string, body any) (int, []byte) {
	a.t.Helper()

	var reader io.Reader
	switch b := body.(type) {
	case nil:
	case string:
		reader = strings.NewReader(b)
	default:
		raw, err := json.Marshal(b)
		if err != nil {
			a.t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequest(method, a.ts.URL+path, reader)
	if err != nil {
		a.t.Fatal(err)
	}
	resp, err := a.ts.Client().Do(req)
	if err != nil {
		a.t.Fatal(err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		a.t.Fatal(err)
	}
	return resp.StatusCode, raw
}

// command manda un POST que tiene que salir bien, revisa que las colas de
// la foto sean exactamente las del hospital y devuelve el Result.
func (a *testAPI) command(path string, body any) Result {
	a.t.Helper()

	status, raw := a.do(http.MethodPost, path, body)
	if status != http.StatusOK {
		a.t.Fatalf("POST %s %v: código %d, se esperaba 200: %s", path, body, status, raw)
	}
	var res Result
	if err := json.Unmarshal(raw, &res); err != nil {
		a.t.Fatalf("POST %s: respuesta inválida: %v", path, err)
	}
	a.checkQueues(res.Snapshot)
	return res
}

func (a *testAPI) checkQueues(snap Snapshot) {
	a.t.Helper()

	a.srv.mu.Lock()
	room, staff := ids(a.srv.h.WaitingForRoom()), ids(a.srv.h.WaitingForStaff())
	a.srv.mu.Unlock()

	if !slices.Equal(snap.RoomQueue, room) {
		a.t.Errorf("roomQueue = %v, el hospital dice %v", snap.RoomQueue, room)
	}
	if !slices.Equal(snap.StaffQueue, staff) {
		a.t.Errorf("staffQueue = %v, el hospital dice %v", snap.StaffQueue, staff)
	}
}

func (a *testAPI) reset(req ResetRequest) Result {
	a.t.Helper()
	return a.command("/api/reset", req)
}

func attackOn(id string, location hospital.Location) AttackRequest {
	return AttackRequest{Patient: id, Location: int(location)}
}

func noticeKinds(notices []Notice) []string {
	kinds := []string{}
	for _, n := range notices {
		kinds = append(kinds, n.Kind)
	}
	return kinds
}

// request es un comando de un test de tabla, con lo que debe producir.
type request struct {
	path    string
	body    any
	events  []Event
	notices []string // Kind de cada aviso, en orden
}

func TestEventCases(t *testing.T) {
	const loc = hospital.LocationCafeteria
	at := int(loc)

	tests := []struct {
		name  string
		reset ResetRequest
		steps []request
	}{
		{
			name:  "caso 1: hay cama y personal",
			reset: ResetRequest{Rooms: 2, Doctors: 1, Patients: 1},
			steps: []request{
				{path: "/api/attacks", body: attackOn("P-001", loc), events: []Event{
					{Type: EventAttackStarted, Patient: "P-001", Location: at},
					{Type: EventRoomAssigned, Patient: "P-001", Room: 101},
					{Type: EventAttentionAssigned, Patient: "P-001", Staff: "D-01"},
				}},
			},
		},
		{
			name:  "caso 2: hay personal, no hay cama",
			reset: ResetRequest{Rooms: 2, Doctors: 3, Patients: 3},
			steps: []request{
				{path: "/api/attacks", body: attackOn("P-001", loc), events: []Event{
					{Type: EventAttackStarted, Patient: "P-001", Location: at},
					{Type: EventRoomAssigned, Patient: "P-001", Room: 101},
					{Type: EventAttentionAssigned, Patient: "P-001", Staff: "D-01"},
				}},
				{path: "/api/attacks", body: attackOn("P-002", loc), events: []Event{
					{Type: EventAttackStarted, Patient: "P-002", Location: at},
					{Type: EventRoomAssigned, Patient: "P-002", Room: 102},
					{Type: EventAttentionAssigned, Patient: "P-002", Staff: "D-02"},
				}},
				{path: "/api/attacks", body: attackOn("P-003", loc), notices: []string{NoticeNoRoom}, events: []Event{
					{Type: EventAttackStarted, Patient: "P-003", Location: at},
					{Type: EventQueuedForRoom, Patient: "P-003"},
					{Type: EventAttentionAssigned, Patient: "P-003", Staff: "D-03"},
				}},
				{path: "/api/wakeups", body: WakeUpRequest{Patient: "P-001"}, events: []Event{
					{Type: EventPatientWoke, Patient: "P-001", Room: 101, Staff: "D-01"},
					{Type: EventRoomAssigned, Patient: "P-003", Room: 101, FromQueue: true},
				}},
			},
		},
		{
			name:  "caso 3: hay cama, no hay personal",
			reset: ResetRequest{Rooms: 3, Doctors: 1, Patients: 2},
			steps: []request{
				{path: "/api/attacks", body: attackOn("P-001", loc), events: []Event{
					{Type: EventAttackStarted, Patient: "P-001", Location: at},
					{Type: EventRoomAssigned, Patient: "P-001", Room: 101},
					{Type: EventAttentionAssigned, Patient: "P-001", Staff: "D-01"},
				}},
				{path: "/api/attacks", body: attackOn("P-002", loc), notices: []string{NoticeNoStaff}, events: []Event{
					{Type: EventAttackStarted, Patient: "P-002", Location: at},
					{Type: EventRoomAssigned, Patient: "P-002", Room: 102},
					{Type: EventQueuedForStaff, Patient: "P-002"},
				}},
				{path: "/api/wakeups", body: WakeUpRequest{Patient: "P-001"}, events: []Event{
					{Type: EventPatientWoke, Patient: "P-001", Room: 101, Staff: "D-01"},
					{Type: EventAttentionAssigned, Patient: "P-002", Staff: "D-01", FromQueue: true},
				}},
			},
		},
		{
			name:  "caso 4: ni cama ni personal",
			reset: ResetRequest{Rooms: 2, Doctors: 1, Orderlies: 1, Patients: 3},
			steps: []request{
				{path: "/api/attacks", body: attackOn("P-001", loc), events: []Event{
					{Type: EventAttackStarted, Patient: "P-001", Location: at},
					{Type: EventRoomAssigned, Patient: "P-001", Room: 101},
					{Type: EventAttentionAssigned, Patient: "P-001", Staff: "D-01"},
				}},
				{path: "/api/attacks", body: attackOn("P-002", loc), events: []Event{
					{Type: EventAttackStarted, Patient: "P-002", Location: at},
					{Type: EventRoomAssigned, Patient: "P-002", Room: 102},
					{Type: EventAttentionAssigned, Patient: "P-002", Staff: "O-01"},
				}},
				{path: "/api/attacks", body: attackOn("P-003", loc), notices: []string{NoticeNoRoom, NoticeNoStaff}, events: []Event{
					{Type: EventAttackStarted, Patient: "P-003", Location: at},
					{Type: EventQueuedForRoom, Patient: "P-003"},
					{Type: EventQueuedForStaff, Patient: "P-003"},
				}},
			},
		},
		{
			name:  "+Doctor atiende al que esperaba",
			reset: ResetRequest{Rooms: 2, Doctors: 1, Patients: 2},
			steps: []request{
				{path: "/api/attacks", body: attackOn("P-001", loc), events: []Event{
					{Type: EventAttackStarted, Patient: "P-001", Location: at},
					{Type: EventRoomAssigned, Patient: "P-001", Room: 101},
					{Type: EventAttentionAssigned, Patient: "P-001", Staff: "D-01"},
				}},
				{path: "/api/attacks", body: attackOn("P-002", loc), notices: []string{NoticeNoStaff}, events: []Event{
					{Type: EventAttackStarted, Patient: "P-002", Location: at},
					{Type: EventRoomAssigned, Patient: "P-002", Room: 102},
					{Type: EventQueuedForStaff, Patient: "P-002"},
				}},
				{path: "/api/staff", body: StaffRequest{Kind: KindDoctor}, events: []Event{
					{Type: EventStaffHired, Staff: "D-02"},
					{Type: EventAttentionAssigned, Patient: "P-002", Staff: "D-02", FromQueue: true},
				}},
			},
		},
		{
			name:  "+Paciente y +Camillero sin nadie esperando",
			reset: ResetRequest{Rooms: 2, Doctors: 1, Patients: 2},
			steps: []request{
				{path: "/api/patients", body: struct{}{}, events: []Event{
					{Type: EventPatientAdmitted, Patient: "P-003"},
				}},
				{path: "/api/staff", body: StaffRequest{Kind: KindOrderly}, events: []Event{
					{Type: EventStaffHired, Staff: "O-01"},
				}},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			api := newTestAPI(t)
			api.reset(tt.reset)

			for i, step := range tt.steps {
				res := api.command(step.path, step.body)
				if !slices.Equal(res.Events, step.events) {
					t.Errorf("paso %d (%s): eventos =\n  %+v\nse esperaba\n  %+v", i+1, step.path, res.Events, step.events)
				}
				if want := append([]string{}, step.notices...); !slices.Equal(noticeKinds(res.Notices), want) {
					t.Errorf("paso %d (%s): avisos = %v, se esperaba %v", i+1, step.path, noticeKinds(res.Notices), want)
				}
			}
		})
	}
}

func TestReset(t *testing.T) {
	api := newTestAPI(t)
	api.command("/api/scenario/start", nil)

	res := api.reset(ResetRequest{Rooms: 3, Doctors: 2, Orderlies: 1, Patients: 4})
	snap := res.Snapshot
	if snap.Mode != ModeFree || res.Step != nil {
		t.Errorf("modo = %q, step = %v; reset debe volver al modo libre", snap.Mode, res.Step)
	}
	if len(res.Events) != 0 || len(res.Notices) != 0 {
		t.Errorf("reset trajo eventos %v y avisos %v, se esperaban vacíos", res.Events, res.Notices)
	}

	var rooms []int
	for _, r := range snap.Rooms {
		rooms = append(rooms, r.Number)
		if r.Capacity != 1 {
			t.Errorf("la habitación %d tiene capacidad %d, se esperaba 1", r.Number, r.Capacity)
		}
	}
	if want := []int{101, 102, 103}; !slices.Equal(rooms, want) {
		t.Errorf("habitaciones = %v, se esperaba %v", rooms, want)
	}

	var staff, kinds []string
	for _, s := range snap.Staff {
		staff, kinds = append(staff, s.ID), append(kinds, s.Kind)
	}
	if want := []string{"D-01", "D-02", "O-01"}; !slices.Equal(staff, want) {
		t.Errorf("personal = %v, se esperaba %v", staff, want)
	}
	if want := []string{KindDoctor, KindDoctor, KindOrderly}; !slices.Equal(kinds, want) {
		t.Errorf("tipos de personal = %v, se esperaba %v", kinds, want)
	}

	var patients []string
	for _, p := range snap.Patients {
		patients = append(patients, p.ID)
		if p.Asleep || p.Name == "" {
			t.Errorf("%s debería empezar despierto y con nombre: %+v", p.ID, p)
		}
	}
	if want := []string{"P-001", "P-002", "P-003", "P-004"}; !slices.Equal(patients, want) {
		t.Errorf("pacientes = %v, se esperaba %v", patients, want)
	}
}

func TestIDsKeepGrowing(t *testing.T) {
	api := newTestAPI(t)

	// El hospital inicial es el del escenario: los IDs nuevos no chocan con él.
	res := api.command("/api/patients", nil)
	if got := res.Events[0].Patient; got != "P-006" {
		t.Errorf("primer +Paciente sobre el escenario = %s, se esperaba P-006", got)
	}

	api.reset(ResetRequest{Rooms: 2, Doctors: 1, Orderlies: 1, Patients: 2})
	steps := []struct {
		path string
		body any
		want string
	}{
		{"/api/patients", nil, "P-003"},
		{"/api/patients", struct{}{}, "P-004"},
		{"/api/staff", StaffRequest{Kind: KindDoctor}, "D-02"},
		{"/api/staff", StaffRequest{Kind: KindOrderly}, "O-02"},
		{"/api/staff", StaffRequest{Kind: KindDoctor}, "D-03"},
	}
	for _, step := range steps {
		ev := api.command(step.path, step.body).Events[0]
		if got := ev.Patient + ev.Staff; got != step.want {
			t.Errorf("POST %s creó %s, se esperaba %s", step.path, got, step.want)
		}
	}
}

func TestGeneratedPeople(t *testing.T) {
	names := func() []string {
		api := newTestAPI(t)
		snap := api.reset(ResetRequest{Rooms: 2, Doctors: 6, Orderlies: 6, Patients: 12}).Snapshot

		var out []string
		for _, p := range snap.Patients {
			out = append(out, p.Name)
			if p.Age < minPatientAge || p.Age > maxPatientAge {
				t.Errorf("%s tiene %d años, fuera de [%d, %d]", p.ID, p.Age, minPatientAge, maxPatientAge)
			}
			if p.Level == hospital.NarcolepsyUnknown.String() {
				t.Errorf("%s quedó con nivel Unknown", p.ID)
			}
		}
		for _, s := range snap.Staff {
			out = append(out, s.Name)
		}

		api.srv.mu.Lock()
		defer api.srv.mu.Unlock()
		for _, d := range api.srv.h.Doctors() {
			if d.Speciality() == hospital.SpecialityUnknown {
				t.Errorf("%s quedó con especialidad Unknown", d.ID())
			}
		}
		return out
	}

	first, second := names(), names()
	if !slices.Equal(first, second) {
		t.Error("con la misma semilla los nombres deberían repetirse")
	}

	seen := make(map[string]bool)
	for _, name := range first {
		if seen[name] {
			t.Errorf("nombre repetido: %s", name)
		}
		seen[name] = true
		if !fromLists(name) {
			t.Errorf("%q no sale de las listas de nombres costeños", name)
		}
	}
}

func fromLists(name string) bool {
	for _, first := range firstNames {
		if last, ok := strings.CutPrefix(name, first+" "); ok && slices.Contains(lastNames, last) {
			return true
		}
	}
	return false
}

func TestScenario(t *testing.T) {
	api := newTestAPI(t)

	start := api.command("/api/scenario/start", struct{}{})
	if start.Snapshot.Mode != ModeScenario {
		t.Errorf("modo = %q, se esperaba %q", start.Snapshot.Mode, ModeScenario)
	}
	if s := start.Step; s == nil || s.Index != 0 || s.Total != 6 || s.Done {
		t.Fatalf("step al empezar = %+v, se esperaba índice 0 de 6", s)
	}
	if len(start.Events) != 0 {
		t.Errorf("scenario/start trajo eventos: %v", start.Events)
	}

	cafeteria, radiology := int(hospital.LocationCafeteria), int(hospital.LocationRadiologyDepartment)
	waiting, hallway := int(hospital.LocationWaitingRoom), int(hospital.LocationMainHallway)
	steps := []struct {
		title   string
		events  []Event
		notices []string
	}{
		{
			title: "Ataque 1: P-001 Toño Mendoza se duerme en Cafeteria",
			events: []Event{
				{Type: EventAttackStarted, Patient: "P-001", Location: cafeteria},
				{Type: EventRoomAssigned, Patient: "P-001", Room: 101},
				{Type: EventAttentionAssigned, Patient: "P-001", Staff: "D-01"},
			},
		},
		{
			title: "Ataque 2: P-002 Yeimy Padilla se duerme en Radiology Department",
			events: []Event{
				{Type: EventAttackStarted, Patient: "P-002", Location: radiology},
				{Type: EventRoomAssigned, Patient: "P-002", Room: 102},
				{Type: EventAttentionAssigned, Patient: "P-002", Staff: "D-02"},
			},
		},
		{
			title: "Ataque 3: P-003 Kelly Johana Torres se duerme en Waiting Room",
			events: []Event{
				{Type: EventAttackStarted, Patient: "P-003", Location: waiting},
				{Type: EventRoomAssigned, Patient: "P-003", Room: 103},
				{Type: EventAttentionAssigned, Patient: "P-003", Staff: "O-01"},
			},
		},
		{
			title: "Ataque 4: P-004 Wilfrido Berrío se duerme en Main Hallway",
			events: []Event{
				{Type: EventAttackStarted, Patient: "P-004", Location: hallway},
				{Type: EventQueuedForRoom, Patient: "P-004"},
				{Type: EventQueuedForStaff, Patient: "P-004"},
			},
			notices: []string{NoticeNoRoom, NoticeNoStaff},
		},
		{
			title:   "[5.3] Asignando habitación a P-004",
			events:  []Event{},
			notices: []string{NoticeNoRoom},
		},
		{
			title: "P-001 Toño Mendoza se despierta",
			events: []Event{
				{Type: EventPatientWoke, Patient: "P-001", Room: 101, Staff: "D-01"},
				{Type: EventRoomAssigned, Patient: "P-004", Room: 101, FromQueue: true},
				{Type: EventAttentionAssigned, Patient: "P-004", Staff: "D-01", FromQueue: true},
			},
		},
	}

	for i, want := range steps {
		res := api.command("/api/scenario/next", struct{}{})

		wantStep := StepView{Index: i + 1, Total: len(steps), Title: want.title, Done: i == len(steps)-1}
		if res.Step == nil || *res.Step != wantStep {
			t.Errorf("paso %d: step = %+v, se esperaba %+v", i+1, res.Step, wantStep)
		}
		if !slices.Equal(res.Events, want.events) {
			t.Errorf("paso %d: eventos =\n  %+v\nse esperaba\n  %+v", i+1, res.Events, want.events)
		}
		if got := noticeKinds(res.Notices); !slices.Equal(got, append([]string{}, want.notices...)) {
			t.Errorf("paso %d: avisos = %v, se esperaba %v", i+1, got, want.notices)
		}
		for _, n := range res.Notices {
			if !strings.Contains(n.Message, "P-004") {
				t.Errorf("paso %d: el aviso %q debería nombrar a P-004", i+1, n.Message)
			}
		}

		if i == 3 {
			snap := res.Snapshot
			if !slices.Equal(snap.RoomQueue, []string{"P-004"}) || !slices.Equal(snap.StaffQueue, []string{"P-004"}) {
				t.Errorf("tras el ataque 4 las colas son %v y %v; Wilfrido debería estar en las dos", snap.RoomQueue, snap.StaffQueue)
			}
		}
	}

	if status, _ := api.do(http.MethodPost, "/api/scenario/next", nil); status != http.StatusConflict {
		t.Errorf("next después del último paso: código %d, se esperaba 409", status)
	}

	res := api.reset(ResetRequest{Rooms: 2, Doctors: 1, Patients: 1})
	if res.Snapshot.Mode != ModeFree {
		t.Errorf("modo tras reset = %q, se esperaba %q", res.Snapshot.Mode, ModeFree)
	}
	api.command("/api/attacks", attackOn("P-001", hospital.LocationLobby))
}

func TestQueries(t *testing.T) {
	api := newTestAPI(t)
	api.command("/api/scenario/start", nil)

	queries := func() Queries {
		t.Helper()
		status, raw := api.do(http.MethodGet, "/api/queries", nil)
		if status != http.StatusOK {
			t.Fatalf("GET /api/queries: código %d: %s", status, raw)
		}
		var q Queries
		if err := json.Unmarshal(raw, &q); err != nil {
			t.Fatal(err)
		}
		return q
	}

	for range 4 {
		api.command("/api/scenario/next", nil)
	}
	if q := queries(); !slices.Equal(q.Hallway, []string{"P-004"}) {
		t.Errorf("5.1 tras el ataque 4 = %v, se esperaba [P-004]", q.Hallway)
	}

	for range 2 {
		api.command("/api/scenario/next", nil)
	}
	q := queries()
	if len(q.Hallway) != 0 {
		t.Errorf("5.1 al final = %v, se esperaba vacío", q.Hallway)
	}

	episodes := make(map[string][]string)
	for _, d := range q.Episodes {
		for _, e := range d.Episodes {
			episodes[d.Doctor] = append(episodes[d.Doctor], e.Patient)
			if e.Attender != d.Doctor {
				t.Errorf("el episodio %s de %s lo atendió %q", e.ID, d.Doctor, e.Attender)
			}
		}
	}
	if got := episodes["D-01"]; !slices.Equal(got, []string{"P-001", "P-004"}) {
		t.Errorf("5.2 de D-01 = %v, se esperaba [P-001 P-004]", got)
	}
	if got := episodes["D-02"]; !slices.Equal(got, []string{"P-002"}) {
		t.Errorf("5.2 de D-02 = %v, se esperaba [P-002]", got)
	}
	if last := q.Episodes[0].Episodes[1]; last.Room != 101 || last.Location != int(hospital.LocationMainHallway) {
		t.Errorf("el episodio de P-004 = %+v, se esperaba en la 101 desde Main Hallway", last)
	}

	want := []SevereCount{{Patient: "P-002", Episodes: 1}, {Patient: "P-004", Episodes: 1}}
	if !slices.Equal(q.Severe, want) {
		t.Errorf("5.4 = %v, se esperaba %v", q.Severe, want)
	}
}

func TestErrors(t *testing.T) {
	type call struct {
		path string
		body any
	}
	base := call{"/api/reset", ResetRequest{Rooms: 2, Doctors: 1, Orderlies: 1, Patients: 2}}
	start := call{"/api/scenario/start", nil}
	next := call{"/api/scenario/next", nil}

	tests := []struct {
		name  string
		setup []call
		call  call
		want  int
	}{
		{"JSON inválido", nil, call{"/api/reset", `{"rooms":`}, http.StatusBadRequest},
		{"tipo inválido", nil, call{"/api/reset", `{"rooms":"tres"}`}, http.StatusBadRequest},
		{"rooms bajo el mínimo", nil, call{"/api/reset", ResetRequest{Rooms: 1, Doctors: 1}}, http.StatusBadRequest},
		{"rooms sobre el máximo", nil, call{"/api/reset", ResetRequest{Rooms: 11, Doctors: 1}}, http.StatusBadRequest},
		{"doctors sobre el máximo", nil, call{"/api/reset", ResetRequest{Rooms: 2, Doctors: 7}}, http.StatusBadRequest},
		{"orderlies negativo", nil, call{"/api/reset", ResetRequest{Rooms: 2, Doctors: 1, Orderlies: -1}}, http.StatusBadRequest},
		{"patients sobre el máximo", nil, call{"/api/reset", ResetRequest{Rooms: 2, Doctors: 1, Patients: 13}}, http.StatusBadRequest},
		{"sin personal", nil, call{"/api/reset", ResetRequest{Rooms: 2, Patients: 2}}, http.StatusBadRequest},
		{"kind desconocido", []call{base}, call{"/api/staff", StaffRequest{Kind: "nurse"}}, http.StatusBadRequest},
		{"ubicación 0", []call{base}, call{"/api/attacks", AttackRequest{Patient: "P-001"}}, http.StatusBadRequest},
		{"ubicación fuera de rango", []call{base}, call{"/api/attacks", AttackRequest{Patient: "P-001", Location: int(hospital.LocationMortuary) + 1}}, http.StatusBadRequest},
		{"ataque sin paciente", []call{base}, call{"/api/attacks", AttackRequest{Location: 4}}, http.StatusBadRequest},
		{"ataque a ID desconocido", []call{base}, call{"/api/attacks", attackOn("P-999", hospital.LocationLobby)}, http.StatusNotFound},
		{"despertar ID desconocido", []call{base}, call{"/api/wakeups", WakeUpRequest{Patient: "P-999"}}, http.StatusNotFound},
		{"paciente ya dormido", []call{base, {"/api/attacks", attackOn("P-001", hospital.LocationLobby)}}, call{"/api/attacks", attackOn("P-001", hospital.LocationPharmacy)}, http.StatusConflict},
		{"despertar a alguien despierto", []call{base}, call{"/api/wakeups", WakeUpRequest{Patient: "P-001"}}, http.StatusConflict},
		{"ataque en modo escenario", []call{start}, call{"/api/attacks", attackOn("P-001", hospital.LocationLobby)}, http.StatusConflict},
		{"despertar en modo escenario", []call{start, next}, call{"/api/wakeups", WakeUpRequest{Patient: "P-001"}}, http.StatusConflict},
		{"+Paciente en modo escenario", []call{start}, call{"/api/patients", nil}, http.StatusConflict},
		{"+Doctor en modo escenario", []call{start}, call{"/api/staff", StaffRequest{Kind: KindDoctor}}, http.StatusConflict},
		{"next en modo libre", []call{base}, call{"/api/scenario/next", nil}, http.StatusConflict},
		{"next al final", []call{start, next, next, next, next, next, next}, next, http.StatusConflict},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			api := newTestAPI(t)
			for _, c := range tt.setup {
				api.command(c.path, c.body)
			}

			status, raw := api.do(http.MethodPost, tt.call.path, tt.call.body)
			if status != tt.want {
				t.Fatalf("código %d, se esperaba %d: %s", status, tt.want, raw)
			}
			var body map[string]string
			if err := json.Unmarshal(raw, &body); err != nil || body["error"] == "" {
				t.Errorf(`el cuerpo debería ser {"error": "..."}: %s`, raw)
			}
		})
	}
}

func TestLimits(t *testing.T) {
	api := newTestAPI(t)
	api.reset(ResetRequest{Rooms: 2, Doctors: 6, Orderlies: 6, Patients: 12})

	for range maxPatients - 12 {
		api.command("/api/patients", nil)
	}
	if status, raw := api.do(http.MethodPost, "/api/patients", nil); status != http.StatusConflict {
		t.Errorf("paciente número %d: código %d, se esperaba 409: %s", maxPatients+1, status, raw)
	}
	if status, raw := api.do(http.MethodPost, "/api/staff", StaffRequest{Kind: KindOrderly}); status != http.StatusConflict {
		t.Errorf("personal número %d: código %d, se esperaba 409: %s", maxStaff+1, status, raw)
	}
}

func TestJSONHasNoNull(t *testing.T) {
	api := newTestAPI(t)

	check := func(what string, raw []byte) {
		t.Helper()
		if bytes.Contains(raw, []byte("null")) {
			t.Errorf("%s tiene null: %s", what, raw)
		}
	}

	_, raw := api.do(http.MethodPost, "/api/reset", ResetRequest{Rooms: 2, Orderlies: 1})
	check("reset sin pacientes", raw)
	for _, field := range []string{`"patients":[]`, `"events":[]`, `"notices":[]`, `"occupants":[]`, `"roomQueue":[]`, `"staffQueue":[]`} {
		if !bytes.Contains(raw, []byte(field)) {
			t.Errorf("reset sin pacientes debería traer %s: %s", field, raw)
		}
	}

	for _, path := range []string{"/api/state", "/api/queries", "/api/locations"} {
		_, raw := api.do(http.MethodGet, path, nil)
		check(path, raw)
	}

	_, raw = api.do(http.MethodPost, "/api/reset", ResetRequest{Rooms: 2, Doctors: 1, Patients: 1})
	check("reset con un doctor sin episodios", raw)
	_, raw = api.do(http.MethodGet, "/api/queries", nil)
	check("consultas con un doctor sin episodios", raw)
	if !bytes.Contains(raw, []byte(`"episodes":[]`)) {
		t.Errorf("un doctor sin episodios debería traer \"episodes\":[]: %s", raw)
	}

	_, raw = api.do(http.MethodPost, "/api/scenario/start", nil)
	check("scenario/start", raw)
	for range 6 {
		_, raw = api.do(http.MethodPost, "/api/scenario/next", nil)
		check("scenario/next", raw)
	}
}

func TestConcurrentRequests(t *testing.T) {
	// Pensado para correr con: go test -race ./...
	api := newTestAPI(t)
	api.reset(ResetRequest{Rooms: 3, Doctors: 2, Orderlies: 1, Patients: 12})

	const workers, requests = 16, 40
	var wg sync.WaitGroup
	for range workers {
		wg.Go(func() {
			for range requests {
				var (
					method = http.MethodPost
					path   string
					body   any
				)
				patient := fmt.Sprintf("P-%03d", 1+rand.IntN(12))
				switch rand.IntN(6) {
				case 0, 1:
					path, body = "/api/attacks", AttackRequest{Patient: patient, Location: 1 + rand.IntN(int(hospital.LocationMortuary))}
				case 2:
					path, body = "/api/wakeups", WakeUpRequest{Patient: patient}
				case 3:
					method, path = http.MethodGet, "/api/state"
				case 4:
					method, path = http.MethodGet, "/api/queries"
				case 5:
					path, body = "/api/staff", StaffRequest{Kind: KindOrderly}
				}

				req, err := newRequest(api.ts.URL, method, path, body)
				if err != nil {
					t.Error(err)
					return
				}
				resp, err := api.ts.Client().Do(req)
				if err != nil {
					t.Error(err)
					return
				}
				_, _ = io.Copy(io.Discard, resp.Body)
				resp.Body.Close()

				// 409: paciente ya dormido o ya despierto, o el tope de personal.
				if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusConflict {
					t.Errorf("%s %s: código %d", method, path, resp.StatusCode)
				}
			}
		})
	}
	wg.Wait()

	status, raw := api.do(http.MethodGet, "/api/state", nil)
	if status != http.StatusOK {
		t.Fatalf("GET /api/state: código %d", status)
	}
	var snap Snapshot
	if err := json.Unmarshal(raw, &snap); err != nil {
		t.Fatal(err)
	}
	api.checkQueues(snap)

	for _, r := range snap.Rooms {
		for _, id := range r.Occupants {
			i := slices.IndexFunc(snap.Patients, func(p PatientView) bool { return p.ID == id })
			if i < 0 || snap.Patients[i].Room != r.Number || !snap.Patients[i].Asleep {
				t.Errorf("la habitación %d tiene a %s, pero el paciente no lo refleja", r.Number, id)
			}
		}
	}
	if n := len(snap.Staff); n > maxStaff {
		t.Errorf("quedaron %d miembros del personal, el máximo es %d", n, maxStaff)
	}
}

// newRequest arma una petición sin testing.T, para usarla desde goroutines.
func newRequest(base, method, path string, body any) (*http.Request, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(raw)
	}
	return http.NewRequest(method, base+path, reader)
}
