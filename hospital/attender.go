package hospital

// Attender es cualquier miembro del personal que puede atender un ataque de
// sueño. El hospital guarda su personal como []Attender y despacha a quien
// toque sin saber si es un Doctor, un Orderly u otro tipo futuro.
type Attender interface {
	ID() string
	Name() string
	Attend(p *Patient, location Location) (EpisodeRecord, error)
}

// Comprobación en tiempo de compilación: si un tipo deja de cumplir la
// interfaz, el programa no compila.
var (
	_ Attender = (*Doctor)(nil)
	_ Attender = (*Orderly)(nil)
)
