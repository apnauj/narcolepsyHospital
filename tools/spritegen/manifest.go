package main

// Tipos del manifest web/assets/sprites.json. Todas las rutas de hoja son
// relativas a web/assets/. El frontend no conoce coordenadas: todo sale de
// aquí.

// Size es un tamaño en pixeles.
type Size struct {
	W int `json:"w"`
	H int `json:"h"`
}

// Point es un punto en pixeles dentro de un frame.
type Point struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// Manifest es la raíz de sprites.json.
type Manifest struct {
	Version    int                    `json:"version"`
	Note       string                 `json:"note"`
	Tile       int                    `json:"tile"`
	Palette    []string               `json:"palette"`
	Characters CharManifest           `json:"characters"`
	Robot      SpriteEntry            `json:"robot"`
	Stretcher  SpriteEntry            `json:"stretcher"`
	Shadow     SpriteEntry            `json:"shadow"`
	Objects    map[string]SpriteEntry `json:"objects"`
	Tiles      TileManifest           `json:"tiles"`
	Emotes     EmoteManifest          `json:"emotes"`
}

// CharManifest describe las hojas de personaje (todas con el mismo orden).
type CharManifest struct {
	Frame      Size                    `json:"frame"`
	Anchor     Point                   `json:"anchor"`
	Columns    int                     `json:"columns"`
	Rows       []RowEntry              `json:"rows"`
	Animations map[string]AnimEntry    `json:"animations"`
	LayerOrder []string                `json:"layerOrder"`
	Layers     map[string][]LayerEntry `json:"layers"`
	Patients   map[string][]string     `json:"patients"`
	Staff      map[string][]Preset     `json:"staff"`
}

// RowEntry documenta una fila: animación, dirección ("" = todas) y frames.
type RowEntry struct {
	Anim   string `json:"anim"`
	Dir    string `json:"dir"`
	Frames int    `json:"frames"`
}

// AnimEntry dice en qué fila está cada dirección de una animación.
type AnimEntry struct {
	Frames int            `json:"frames"`
	FPS    float64        `json:"fps"`
	Loop   bool           `json:"loop"`
	Rows   map[string]int `json:"rows"`
}

// LayerEntry es una capa. Sheet nil = capa vacía (calvo, sin accesorio).
type LayerEntry struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Sheet *string `json:"sheet"`
}

// SpriteEntry es un sprite suelto o animado: los frames van en una fila
// horizontal a partir de (x, y) dentro de la hoja.
//   - Anchor (entidades que se mueven: robot, camilla, sombra): el pixel que
//     va en la posición de la entidad (el punto que toca el piso).
//   - Origin (decoración del mapa): el pixel del sprite que cae en la esquina
//     superior izquierda del tile (tx, ty) de la decoración. Puede ser
//     negativo o mayor que 16 si el sprite sobresale del tile.
//   - Footprint: tiles que ocupa (w×h), igual al w/h del mapa.
//   - Ride: dónde se dibuja el paciente acostado encima (cama, camilla,
//     robot).
type SpriteEntry struct {
	Sheet     string  `json:"sheet"`
	X         int     `json:"x"`
	Y         int     `json:"y"`
	Frame     Size    `json:"frame"`
	Frames    int     `json:"frames"`
	FPS       float64 `json:"fps"`
	Anchor    *Point  `json:"anchor,omitempty"`
	Origin    *Point  `json:"origin,omitempty"`
	Footprint *Size   `json:"footprint,omitempty"`
	Ride      *Ride   `json:"ride,omitempty"`
	// Sit: centro del frame del paciente sentado (animación "wake") sobre
	// la cama, sin giro.
	Sit *Point `json:"sit,omitempty"`
	// Mattress: rectángulo del colchón; el paciente acostado queda dentro.
	Mattress *Rect `json:"mattress,omitempty"`
	// Cover: parte del sprite (la manta) que se repinta encima del
	// paciente para que parezca tapado.
	Cover  *Rect    `json:"cover,omitempty"`
	Tags   []string `json:"tags,omitempty"`
	Source string   `json:"source"`
}

// Rect es un rectángulo en pixeles del sprite.
type Rect struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

// Ride ubica al paciente acostado (frame "stretcher" o "sleep"): el centro
// geométrico de su frame de 20×20 va en (X, Y) del sprite (coordenadas
// continuas), después de girarlo Rotate grados en sentido horario y de
// reflejarlo en horizontal si FlipX. Así:
//
//	ctx.translate(left + X, top + Y); ctx.rotate(Rotate°); ctx.scale(FlipX ? -1 : 1, 1)
//	ctx.drawImage(frame, -10, -10)
type Ride struct {
	X      int  `json:"x"`
	Y      int  `json:"y"`
	Rotate int  `json:"rotate"`
	FlipX  bool `json:"flipX"`
}

// TileManifest: hoja de tiles de 16x16; cada nombre apunta a su celda.
type TileManifest struct {
	Sheet string               `json:"sheet"`
	Size  int                  `json:"size"`
	Tiles map[string]TileEntry `json:"tiles"`
	// ByType: nombre de tile para cada valor de TILE del mapa.
	ByType map[string]string `json:"byType"`
}

// TileEntry: posición en pixeles; Frames > 1 para tiles animados (en fila).
type TileEntry struct {
	X      int     `json:"x"`
	Y      int     `json:"y"`
	Frames int     `json:"frames"`
	FPS    float64 `json:"fps"`
	Source string  `json:"source"`
}

// EmoteManifest: globos de emoción de 16x16 en una fila.
type EmoteManifest struct {
	Sheet  string         `json:"sheet"`
	Frame  Size           `json:"frame"`
	Count  int            `json:"count"`
	Names  map[string]int `json:"names"`
	Source string         `json:"source"`
}
