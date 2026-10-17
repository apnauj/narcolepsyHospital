package hospital

import (
	"math/rand/v2"
	"sync"
	"time"
)

// Simulate lanza una goroutine por paciente. Cada una sufre `attacks` ataques
// en ubicaciones al azar, con esperas aleatorias de hasta maxDelay, y se
// despierta después de cada uno. Todas comparten el hospital, protegido por
// su mutex. Devuelve los errores previstos que ocurrieron (por ejemplo,
// ErrNoRoomAvailable).
func (h *Hospital) Simulate(attacks int, maxDelay time.Duration) []error {
	patients := h.Patients()

	// Cada goroutine manda como mucho dos errores por ataque, así que con este
	// buffer ningún envío se bloquea.
	errs := make(chan error, 2*attacks*len(patients))

	var wg sync.WaitGroup
	for _, p := range patients {
		wg.Go(func() {
			h.simulatePatient(p, attacks, maxDelay, errs)
		})
	}
	wg.Wait()
	close(errs)

	var result []error
	for err := range errs {
		result = append(result, err)
	}
	return result
}

func (h *Hospital) simulatePatient(p *Patient, attacks int, maxDelay time.Duration, errs chan<- error) {
	if h.isAsleep(p) {
		if err := h.WakeUpPatient(p); err != nil {
			errs <- err
			return
		}
	}

	for range attacks {
		time.Sleep(randomDelay(maxDelay))
		if err := h.RegisterEpisode(p, randomLocation()); err != nil {
			errs <- err
		}

		time.Sleep(randomDelay(maxDelay))
		if err := h.WakeUpPatient(p); err != nil {
			errs <- err
		}
	}
}

func (h *Hospital) isAsleep(p *Patient) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	return p.IsAsleep()
}

func randomDelay(maxDelay time.Duration) time.Duration {
	if maxDelay <= 0 {
		return 0
	}
	return rand.N(maxDelay)
}

func randomLocation() Location {
	return Location(rand.IntN(int(LocationMortuary)) + 1)
}
