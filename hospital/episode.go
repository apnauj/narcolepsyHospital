package hospital

import (
	"fmt"
	"time"
)

// EpisodeRecord es una foto del ataque en el momento en que se atendió.
// Se maneja por valor: quien recibe una copia no puede alterar el historial.
type EpisodeRecord struct {
	id       string
	date     time.Time
	patient  *Patient
	attender Attender
	location Location
	room     *Room // nil si no había cama libre
}

func newEpisodeRecord(p *Patient, a Attender, location Location) EpisodeRecord {
	return EpisodeRecord{
		id:       fmt.Sprintf("%s-E%02d", p.ID(), p.episodeCount),
		date:     time.Now(),
		patient:  p,
		attender: a,
		location: location,
		room:     p.room,
	}
}

func (e EpisodeRecord) ID() string         { return e.id }
func (e EpisodeRecord) Date() time.Time    { return e.date }
func (e EpisodeRecord) Patient() *Patient  { return e.patient }
func (e EpisodeRecord) Attender() Attender { return e.attender }
func (e EpisodeRecord) Location() Location { return e.location }
func (e EpisodeRecord) Room() *Room        { return e.room }

func (e EpisodeRecord) Summary() string {
	room := "sin habitación"
	if e.room != nil {
		room = fmt.Sprintf("habitación %d", e.room.Number())
	}

	return fmt.Sprintf("%s  %s  %-20s -> %-15s (atendió %s)",
		e.date.Format("2006-01-02 15:04"), e.patient.ID(), e.location, room, e.attender.Name())
}
