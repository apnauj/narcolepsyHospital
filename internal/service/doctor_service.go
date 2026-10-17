package service

import (
	"context"
	"fmt"
	"sync"

	"objetosCostenos/pkg/hospital"
)

type DoctorService struct {
	mu      sync.RWMutex                // Protege el mapa contra lecturas/escrituras simultáneas
	doctors map[string]*hospital.Doctor // Almacenamiento en RAM (Key: ID del doctor)
}

func NewDoctorService() *DoctorService {
	return &DoctorService{
		doctors: make(map[string]*hospital.Doctor),
	}
}

// RegisterDoctor valida y guarda el doctor directamente en memoria
func (s *DoctorService) RegisterDoctor(ctx context.Context, id, name string, spec hospital.Speciality) (*hospital.Doctor, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.doctors[id]; exists {
		return nil, fmt.Errorf("el doctor con ID %s ya existe en el sistema", id)
	}

	doc, err := hospital.NewDoctor(id, name, spec)
	if err != nil {
		return nil, fmt.Errorf("datos de doctor inválidos: %w", err)
	}

	s.doctors[id] = doc
	return doc, nil
}

// GetDoctorByID busca un doctor en la RAM
func (s *DoctorService) GetDoctorByID(ctx context.Context, id string) (*hospital.Doctor, error) {
	s.mu.RLock() // RLock permite múltiples lecturas en paralelo
	defer s.mu.RUnlock()

	doc, exists := s.doctors[id]
	if !exists {
		return nil, fmt.Errorf("doctor con ID %s no encontrado", id)
	}

	return doc, nil
}

// ListDoctors retorna todos los doctores almacenados en la sesión actual
func (s *DoctorService) ListDoctors(ctx context.Context) []*hospital.Doctor {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]*hospital.Doctor, 0, len(s.doctors))
	for _, doc := range s.doctors {
		list = append(list, doc)
	}

	return list
}
