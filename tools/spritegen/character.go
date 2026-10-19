package main

import (
	"fmt"
	"sort"
)

// Tamaño del frame de personaje: 20×20. Las grillas se dibujan de 16×20 y
// se centran (2 px a cada lado), así el cuerpo acostado y las alas del
// vueltiao caben sin recortarse. Las 4 filas de arriba quedan para
// sombreros y para los "!" y "z"; los pies tocan la fila 19.
const (
	CharW = 20
	CharH = 20
	GridW = 16
	gridX = (CharW - GridW) / 2
	// Al acostar se gira desde la fila lyingTop (incluye la punta del pelo)
	// y se baja lyingDY para que el cuerpo quede sobre el piso.
	lyingTop = 3
	lyingDX  = 1
	lyingDY  = 3
)

// Dirs es el orden de direcciones en las filas de la hoja.
var Dirs = []string{"down", "up", "left", "right"}

// Pose describe un frame: qué piernas, cuánto se mueve cada parte y qué
// efectos lleva.
type Pose struct {
	Dir     string   // down|up|left|right (right = left reflejado)
	Legs    string   // stand|stepA|stepB|crouch
	HeadDY  int      // desplazamiento vertical de la cabeza
	TorsoDY int      // desplazamiento vertical del torso
	DX, DY  int      // desplazamiento del frame entero
	Closed  bool     // ojos cerrados
	Lying   bool     // acostado: se gira el cuerpo con la cabeza a la izquierda
	Extra   []string // partes de pose extra (manos al frente, etc.)
	FX      string   // efecto encima, solo en la capa base ("!", "z"...)
}

// Anim es una fila (o 4 filas, una por dirección) de la hoja.
type Anim struct {
	Name        string
	FPS         float64
	Loop        bool
	Directional bool
	// Frames construye los frames para una dirección.
	Frames func(dir string) []Pose
}

// Animations es el orden de las filas de todas las hojas de personaje. Si
// es direccional ocupa 4 filas (down, up, left, right); si no, una sola que
// sirve para las 4 direcciones.
var Animations = []Anim{
	{Name: "idle", FPS: 1.5, Loop: true, Directional: true, Frames: func(d string) []Pose {
		return []Pose{{Dir: d, Legs: "stand"}, {Dir: d, Legs: "stand", Closed: true}}
	}},
	{Name: "walk", FPS: 8, Loop: true, Directional: true, Frames: func(d string) []Pose {
		return []Pose{
			{Dir: d, Legs: "stand"},
			{Dir: d, Legs: "stepA", DY: -1},
			{Dir: d, Legs: "stand"},
			{Dir: d, Legs: "stepB", DY: -1},
		}
	}},
	{Name: "attend", FPS: 3, Loop: true, Directional: true, Frames: func(d string) []Pose {
		return []Pose{
			{Dir: d, Legs: "crouch", HeadDY: 2, TorsoDY: 2},
			{Dir: d, Legs: "crouch", HeadDY: 2, TorsoDY: 2, Extra: []string{"attend"}},
			{Dir: d, Legs: "crouch", HeadDY: 3, TorsoDY: 2, Extra: []string{"attend"}},
		}
	}},
	{Name: "push", FPS: 8, Loop: true, Directional: true, Frames: func(d string) []Pose {
		x := []string{"push"}
		return []Pose{
			{Dir: d, Legs: "stand", Extra: x},
			{Dir: d, Legs: "stepA", DY: -1, Extra: x},
			{Dir: d, Legs: "stand", Extra: x},
			{Dir: d, Legs: "stepB", DY: -1, Extra: x},
		}
	}},
	{Name: "attack", FPS: 3, Loop: false, Frames: func(string) []Pose {
		return []Pose{
			{Dir: "down", Legs: "stand", FX: "fx_alert"},
			{Dir: "down", Legs: "stepA", DX: 1, HeadDY: 1, Closed: true, FX: "fx_dizzy"},
			{Dir: "down", Legs: "stand", Closed: true, Lying: true},
		}
	}},
	{Name: "sleep", FPS: 1.5, Loop: true, Frames: func(string) []Pose {
		return []Pose{
			{Dir: "down", Legs: "stand", Closed: true, Lying: true, FX: "fx_z1"},
			{Dir: "down", Legs: "stand", Closed: true, Lying: true, FX: "fx_z2"},
		}
	}},
	{Name: "stretcher", FPS: 0, Loop: false, Frames: func(string) []Pose {
		return []Pose{{Dir: "down", Legs: "stand", Closed: true, Lying: true}}
	}},
	{Name: "wake", FPS: 3, Loop: false, Frames: func(string) []Pose {
		return []Pose{
			{Dir: "down", Legs: "crouch", HeadDY: 2, TorsoDY: 2, Closed: true},
			{Dir: "down", Legs: "crouch", HeadDY: 2, TorsoDY: 2},
			{Dir: "down", Legs: "stand", HeadDY: -1, DY: -1, Closed: true, FX: "fx_spark"},
		}
	}},
}

// SheetRow es una fila calculada de la hoja.
type SheetRow struct {
	Anim, Dir string
	Poses     []Pose
}

// SheetRows despliega Animations en filas.
func SheetRows() []SheetRow {
	var rows []SheetRow
	for _, a := range Animations {
		if a.Directional {
			for _, d := range Dirs {
				rows = append(rows, SheetRow{a.Name, d, a.Frames(d)})
			}
		} else {
			rows = append(rows, SheetRow{a.Name, "", a.Frames("down")})
		}
	}
	return rows
}

// SheetCols es el número de columnas: el máximo de frames de una fila.
func SheetCols() int {
	n := 0
	for _, r := range SheetRows() {
		if len(r.Poses) > n {
			n = len(r.Poses)
		}
	}
	return n
}

// Categorías de capa, en orden de dibujo.
var LayerOrder = []string{"skin", "torso", "head", "accessory"}

// Layer es una capa del sistema de "muñeco de papel". Todas las hojas de
// capa comparten el mismo orden de filas y columnas, así que el renderer
// dibuja la misma celda de cada capa una encima de otra.
type Layer struct {
	ID       string
	Name     string
	Category string // skin|torso|head|accessory
	// Prefix de las grillas propias: <Prefix>_down, _up, _left. Una
	// dirección sin grilla no dibuja nada. Vacío = capa sin sprite.
	Prefix string
	// Anchor: qué parte del cuerpo sigue (head|torso).
	Anchor string
	// Slots: colores de las ranuras de las grillas propias y, para skin y
	// torso, de las partes de pose (piernas y extras: P, R, F, A, X).
	Slots SlotMap
}

// Ranuras que se pintan en las partes de pose (piernas y extras).
const poseSlots = "PRFAX"

// skinSlots arma el mapa de la capa base para un tono de piel.
func skinSlots(skin, shadow int) SlotMap {
	ink := byName("tinta")
	return SlotMap{
		'S': skin, 'D': shadow, 'K': ink,
		// Lo que cubre la ropa queda en piel por debajo.
		'P': skin, 'R': skin, 'F': shadow, 'A': skin,
		// Ojos abiertos: E es pupila y L piel. Cerrados: se invierte.
		'E': ink, 'L': skin,
	}
}

// eyes devuelve el mapa con los ojos abiertos o cerrados.
func eyes(m SlotMap, closed bool) SlotMap {
	out := SlotMap{}
	for k, v := range m {
		out[k] = v
	}
	if closed {
		out['E'], out['L'] = m['S'], byName("tinta")
	}
	return out
}

// poseMap filtra el mapa de una capa a las ranuras de pose. Para las capas
// de ropa, la piel (S, D) borra: así una mano al frente queda visible
// aunque la ropa estuviera debajo.
func poseMap(l *Layer) SlotMap {
	out := SlotMap{}
	for k, v := range l.Slots {
		for _, s := range poseSlots {
			if k == s {
				out[k] = v
			}
		}
	}
	if l.Category != "skin" {
		out['S'], out['D'] = Transparent, Transparent
	}
	return out
}

// Composer arma frames de personaje a partir de las grillas.
type Composer struct {
	Grids map[string]*Grid
}

func (c *Composer) grid(name string) *Grid { return c.Grids[name] }

func (c *Composer) need(name string) (*Grid, error) {
	g := c.Grids[name]
	if g == nil {
		return nil, fmt.Errorf("falta la grilla %q", name)
	}
	if g.W != GridW || g.H != CharH {
		return nil, fmt.Errorf("la grilla %q mide %dx%d; las de personaje miden %dx%d", name, g.W, g.H, GridW, CharH)
	}
	return g, nil
}

// Frame dibuja una pose para una capa.
func (c *Composer) Frame(l *Layer, p Pose) (*Canvas, error) {
	if p.Lying {
		up := p
		up.Lying, up.FX, up.DX, up.DY = false, "", 0, 0
		stand, err := c.Frame(l, up)
		if err != nil {
			return nil, err
		}
		// Se gira el cuerpo con la cabeza a la izquierda y se apoya contra
		// el piso.
		body := stand.Crop(0, lyingTop, CharW, CharH-lyingTop).RotateCCW()
		out := NewCanvas(CharW, CharH)
		out.Blit(body, lyingDX, lyingDY)
		return c.fx(l, out, p)
	}
	dir, mirror := p.Dir, false
	if dir == "right" {
		dir, mirror = "left", true
	}
	cv := NewCanvas(CharW, CharH)
	isSkin := l.Category == "skin"
	if isSkin || l.Category == "torso" {
		legs, err := c.need("legs_" + dir + "_" + p.Legs)
		if err != nil {
			return nil, err
		}
		cv.DrawGrid(legs, gridX, 0, poseMap(l), isSkin)
	}
	if isSkin {
		torso, err := c.need("body_torso_" + dir)
		if err != nil {
			return nil, err
		}
		head, err := c.need("body_head_" + dir)
		if err != nil {
			return nil, err
		}
		m := eyes(l.Slots, p.Closed)
		cv.DrawGrid(torso, gridX, p.TorsoDY, m, true)
		cv.DrawGrid(head, gridX, p.HeadDY, m, true)
	}
	if l.Prefix != "" {
		if g := c.grid(l.Prefix + "_" + dir); g != nil {
			if g.W != GridW || g.H != CharH {
				return nil, fmt.Errorf("la grilla %q mide %dx%d", g.Name, g.W, g.H)
			}
			dy := p.TorsoDY
			if l.Anchor == "head" {
				dy = p.HeadDY
			}
			cv.DrawGrid(g, gridX, dy, l.Slots, true)
		}
	}
	if isSkin || l.Category == "torso" {
		for _, x := range p.Extra {
			if g := c.grid("extra_" + x + "_" + dir); g != nil {
				cv.DrawGrid(g, gridX, p.TorsoDY, poseMap(l), isSkin)
			}
		}
	}
	if mirror {
		cv = cv.Mirror()
	}
	cv = cv.Shift(p.DX, p.DY)
	return c.fx(l, cv, p)
}

// fx pinta el efecto de la pose, solo en la capa base.
func (c *Composer) fx(l *Layer, cv *Canvas, p Pose) (*Canvas, error) {
	if p.FX == "" || l.Category != "skin" {
		return cv, nil
	}
	g, err := c.need(p.FX)
	if err != nil {
		return nil, err
	}
	cv.DrawGrid(g, gridX, 0, nil, true)
	return cv, nil
}

// Sheet arma la hoja completa de una capa.
func (c *Composer) Sheet(l *Layer) (*Canvas, error) {
	rows := SheetRows()
	cols := SheetCols()
	sheet := NewCanvas(cols*CharW, len(rows)*CharH)
	for ri, r := range rows {
		for fi, p := range r.Poses {
			f, err := c.Frame(l, p)
			if err != nil {
				return nil, fmt.Errorf("capa %s, %s/%s frame %d: %w", l.ID, r.Anim, r.Dir, fi, err)
			}
			sheet.Blit(f, fi*CharW, ri*CharH)
		}
	}
	return sheet, nil
}

// Skins: tonos de piel (cambio de paleta de la capa base).
func Skins() []*Layer {
	tones := []struct{ id, name, s, d string }{
		{"piel-1", "Piel clara", "piel-1", "piel-1-sombra"},
		{"piel-2", "Piel trigueña", "piel-2", "piel-2-sombra"},
		{"piel-3", "Piel morena", "piel-3", "piel-3-sombra"},
		{"piel-4", "Piel negra", "piel-4", "piel-4-sombra"},
	}
	var out []*Layer
	for _, t := range tones {
		out = append(out, &Layer{ID: t.id, Name: t.name, Category: "skin", Anchor: "torso",
			Slots: skinSlots(byName(t.s), byName(t.d))})
	}
	return out
}

// Variant es un cambio de paleta de una capa: ID, nombre y colores.
type Variant struct {
	ID, Name string
	Slots    SlotMap
}

// expand crea una capa por variante a partir de una base.
func expand(base Layer, vs ...Variant) []*Layer {
	var out []*Layer
	for _, v := range vs {
		l := base
		l.ID, l.Name = v.ID, v.Name
		l.Slots = SlotMap{}
		for k, x := range base.Slots {
			l.Slots[k] = x
		}
		for k, x := range v.Slots {
			l.Slots[k] = x
		}
		out = append(out, &l)
	}
	return out
}

// Atajo para colores por nombre.
func n(name string) int { return byName(name) }

// hair arma los colores de pelo: H (pelo) e I (brillo o sombra).
func hair(h, i string) SlotMap { return SlotMap{'H': n(h), 'I': n(i)} }

// Hairs son las variantes de color de pelo.
var Hairs = []struct{ ID, Name, H, I string }{
	{"negro", "negro", "azul-noche", "sombra-azul"},
	{"cafe", "café", "cafe-pelo", "madera-oscura"},
	{"canoso", "canoso", "gris-claro", "gris"},
}

func hairVariants(prefix, name string) []Variant {
	var vs []Variant
	for _, h := range Hairs {
		vs = append(vs, Variant{prefix + "-" + h.ID, name + " " + h.Name, hair(h.H, h.I)})
	}
	return vs
}

// Layers devuelve el catálogo completo de capas por categoría.
func Layers() map[string][]*Layer {
	m := map[string][]*Layer{}
	m["skin"] = Skins()

	// Ropa: A color principal (también la manga en las partes de pose),
	// B sombra, C detalle; P pantalón o pantaloneta, R pierna baja (pantalón
	// largo o piel), F calzado.
	torso := []*Layer{}
	torso = append(torso, &Layer{ID: "camiseta-junior", Name: "Camiseta rayada rojiblanca", Category: "torso",
		Prefix: "torso_junior", Anchor: "torso",
		Slots: SlotMap{'A': n("rojo-junior"), 'P': n("azul-noche"), 'F': n("blanco")}})
	torso = append(torso, expand(Layer{Category: "torso", Prefix: "torso_guayabera", Anchor: "torso",
		Slots: SlotMap{'R': n("arena"), 'F': n("madera-oscura")}},
		Variant{"guayabera-blanca", "Guayabera blanca", SlotMap{'A': n("blanco"), 'B': n("gris-claro"), 'P': n("arena"), 'R': n("arena")}},
		Variant{"guayabera-crema", "Guayabera crema", SlotMap{'A': n("arena"), 'B': n("madera-clara"), 'P': n("cafe-pelo"), 'R': n("cafe-pelo")}},
	)...)
	torso = append(torso, expand(Layer{Category: "torso", Prefix: "torso_floreada", Anchor: "torso",
		Slots: SlotMap{'F': n("azul-mar")}},
		Variant{"floreada-azul", "Camisa floreada azul", SlotMap{'A': n("azul-mar"), 'B': n("sombra-azul"), 'C': n("sol"), 'G': n("blanco"), 'P': n("arena")}},
		Variant{"floreada-amarilla", "Camisa floreada amarilla", SlotMap{'A': n("sol"), 'B': n("naranja"), 'C': n("rojo-junior"), 'G': n("verde-tropical"), 'P': n("azul-mar")}},
		Variant{"floreada-roja", "Camisa floreada roja", SlotMap{'A': n("rojo-junior"), 'B': n("rojo-oscuro"), 'C': n("blanco"), 'G': n("sol"), 'P': n("arena")}},
		Variant{"floreada-menta", "Camisa floreada menta", SlotMap{'A': n("menta"), 'B': n("menta-oscuro"), 'C': n("rosado"), 'G': n("sol"), 'P': n("azul-noche")}},
	)...)
	torso = append(torso, &Layer{ID: "camisilla-blanca", Name: "Camisilla blanca", Category: "torso",
		Prefix: "torso_camisilla", Anchor: "torso",
		// Sin mangas: el brazo queda en piel (A no se pinta).
		Slots: SlotMap{'P': n("azul-mar"), 'F': n("azul-mar")}})
	// Personal.
	torso = append(torso, &Layer{ID: "bata", Name: "Bata blanca con estetoscopio", Category: "torso",
		Prefix: "torso_bata", Anchor: "torso",
		Slots: SlotMap{'A': n("blanco"), 'P': n("gris"), 'R': n("gris"), 'F': n("tinta"), 'X': n("gris")}})
	torso = append(torso, expand(Layer{Category: "torso", Prefix: "torso_scrubs", Anchor: "torso",
		Slots: SlotMap{'F': n("blanco")}},
		Variant{"quirurgico-azul", "Uniforme quirúrgico azul", SlotMap{'A': n("azul-mar"), 'B': n("sombra-azul"), 'P': n("azul-mar"), 'R': n("azul-mar")}},
		Variant{"quirurgico-verde", "Uniforme quirúrgico verde", SlotMap{'A': n("menta-oscuro"), 'B': n("verde-oscuro"), 'P': n("menta-oscuro"), 'R': n("menta-oscuro")}},
	)...)
	m["torso"] = torso

	head := []*Layer{}
	head = append(head, expand(Layer{Category: "head", Prefix: "head_corto", Anchor: "head"}, hairVariants("pelo-corto", "Pelo corto")...)...)
	head = append(head, expand(Layer{Category: "head", Prefix: "head_crespo", Anchor: "head"}, hairVariants("pelo-crespo", "Pelo crespo")[:2]...)...)
	head = append(head, expand(Layer{Category: "head", Prefix: "head_cola", Anchor: "head"}, hairVariants("pelo-cola", "Pelo largo con moña")...)...)
	head = append(head, &Layer{ID: "calvo", Name: "Calvo", Category: "head", Anchor: "head"})
	head = append(head, &Layer{ID: "vueltiao", Name: "Sombrero vueltiao", Category: "head", Prefix: "head_vueltiao", Anchor: "head",
		Slots: hair("azul-noche", "sombra-azul")})
	head = append(head, expand(Layer{Category: "head", Prefix: "head_gorro", Anchor: "head"},
		Variant{"gorro-azul", "Gorro quirúrgico azul", SlotMap{'A': n("azul-mar"), 'B': n("sombra-azul"), 'H': n("azul-noche"), 'I': n("sombra-azul")}},
		Variant{"gorro-verde", "Gorro quirúrgico verde", SlotMap{'A': n("menta-oscuro"), 'B': n("verde-oscuro"), 'H': n("cafe-pelo"), 'I': n("madera-oscura")}},
	)...)
	m["head"] = head

	acc := []*Layer{}
	acc = append(acc, &Layer{ID: "ninguno", Name: "Sin accesorio", Category: "accessory", Anchor: "torso"})
	acc = append(acc, &Layer{ID: "mochila-wayuu", Name: "Mochila wayuu", Category: "accessory", Prefix: "acc_mochila", Anchor: "torso"})
	acc = append(acc, &Layer{ID: "abanico", Name: "Abanico", Category: "accessory", Prefix: "acc_abanico", Anchor: "torso"})
	acc = append(acc, &Layer{ID: "gafas-oscuras", Name: "Gafas oscuras", Category: "accessory", Prefix: "acc_gafas", Anchor: "head"})
	acc = append(acc, &Layer{ID: "cadena", Name: "Cadena", Category: "accessory", Prefix: "acc_cadena", Anchor: "torso"})
	m["accessory"] = acc
	return m
}

// Preset es una combinación fija de capas (por ID) para el personal.
type Preset struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Skin      string `json:"skin"`
	Torso     string `json:"torso"`
	Head      string `json:"head"`
	Accessory string `json:"accessory"`
	// Weight: probabilidad relativa al elegir por hash.
	Weight int `json:"weight"`
}

// PatientPools: IDs de capa que pueden salirle a un paciente. Repetir un ID
// le da más peso (por ejemplo "ninguno" en accesorios).
func PatientPools() map[string][]string {
	return map[string][]string{
		"skin":      {"piel-1", "piel-2", "piel-3", "piel-4"},
		"torso":     {"camiseta-junior", "camiseta-junior", "guayabera-blanca", "guayabera-crema", "floreada-azul", "floreada-amarilla", "floreada-roja", "floreada-menta", "camisilla-blanca", "camisilla-blanca"},
		"head":      {"pelo-corto-negro", "pelo-corto-cafe", "pelo-corto-canoso", "pelo-crespo-negro", "pelo-crespo-cafe", "pelo-cola-negro", "pelo-cola-cafe", "pelo-cola-canoso", "calvo", "vueltiao", "vueltiao"},
		"accessory": {"ninguno", "ninguno", "ninguno", "mochila-wayuu", "abanico", "gafas-oscuras", "cadena"},
	}
}

// StaffPresets: variantes por tipo de personal. El doctor del vueltiao es
// el huevo de pascua: sale poco (peso 1 contra 6).
func StaffPresets() map[string][]Preset {
	return map[string][]Preset{
		"doctor": {
			{"doctor-1", "Doctor de pelo corto", "piel-2", "bata", "pelo-corto-negro", "ninguno", 6},
			{"doctor-2", "Doctora de moña", "piel-1", "bata", "pelo-cola-cafe", "ninguno", 6},
			{"doctor-3", "Doctor canoso", "piel-4", "bata", "pelo-corto-canoso", "gafas-oscuras", 6},
			{"doctor-4", "Doctora de pelo crespo", "piel-3", "bata", "pelo-crespo-negro", "ninguno", 6},
			{"doctor-vueltiao", "Doctor del vueltiao", "piel-3", "bata", "vueltiao", "ninguno", 1},
		},
		"orderly": {
			{"camillero-1", "Camillero de azul", "piel-3", "quirurgico-azul", "gorro-azul", "ninguno", 1},
			{"camillero-2", "Camillera de verde", "piel-1", "quirurgico-verde", "gorro-verde", "ninguno", 1},
			{"camillero-3", "Camillero de verde", "piel-4", "quirurgico-verde", "pelo-corto-negro", "ninguno", 1},
			{"camillero-4", "Camillera de azul", "piel-2", "quirurgico-azul", "pelo-cola-negro", "ninguno", 1},
		},
		"other": {
			{"otro-1", "Administrativo", "piel-2", "guayabera-blanca", "pelo-corto-canoso", "gafas-oscuras", 1},
			{"otro-2", "Recepcionista", "piel-3", "floreada-menta", "pelo-cola-negro", "ninguno", 1},
		},
	}
}

// layerIndex arma un índice ID -> capa y valida que no haya repetidos.
func layerIndex(m map[string][]*Layer) (map[string]*Layer, error) {
	idx := map[string]*Layer{}
	cats := make([]string, 0, len(m))
	for c := range m {
		cats = append(cats, c)
	}
	sort.Strings(cats)
	for _, c := range cats {
		for _, l := range m[c] {
			if _, dup := idx[l.ID]; dup {
				return nil, fmt.Errorf("capa repetida %q", l.ID)
			}
			idx[l.ID] = l
		}
	}
	return idx, nil
}
