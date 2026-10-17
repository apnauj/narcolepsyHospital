package hospital

import "time"

type Episode struct {
	id              string
	date            time.Time
	patient         *Patient
	attendingDoctor *Doctor
	location        *Location
	room            int
}
