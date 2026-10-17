package hospital

import "fmt"

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
