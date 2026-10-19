package main

import (
	"fmt"
	"image"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"sort"
)

// Claves de objects en el manifest: el "kind" de la decoración del mapa
// (web/js/world/modules.js). Variantes:
//   - "kind@WxH": versión para una huella de W×H tiles (si no existe, el
//     renderer usa "kind" y, si tiene la etiqueta "repeat", lo repite).
//   - "kind:dir": versión por dirección (la cama: dir = de la cabecera a los
//     pies, el mismo "dir" que trae la decoración).

// frameSource produce los frames de un objeto.
type frameSource func(env *objEnv) ([]*Canvas, error)

// objEnv es lo que necesitan las fuentes: grillas y hojas de los packs.
type objEnv struct {
	grids  map[string]*Grid
	vendor string
	sheets map[string]image.Image
}

// decorDef describe un objeto del catálogo.
type decorDef struct {
	Key       string
	Src       frameSource
	FPS       float64
	Footprint Size   // en tiles; 0 = 1×1
	Origin    *Point // nil = centrado en la huella y apoyado abajo
	Ride      *Ride
	Sit       *Point
	Mattress  *Rect
	Cover     *Rect
	Tags      []string
	Source    string // "propio" o el pack
}

// grids: un frame por grilla.
func grids(names ...string) frameSource {
	return func(env *objEnv) ([]*Canvas, error) {
		var out []*Canvas
		for _, name := range names {
			g := env.grids[name]
			if g == nil {
				return nil, fmt.Errorf("falta la grilla %q", name)
			}
			out = append(out, GridCanvas(g, nil))
		}
		return out, nil
	}
}

// transformed aplica una transformación a cada frame de otra fuente.
func transformed(src frameSource, f func(*Canvas) *Canvas) frameSource {
	return func(env *objEnv) ([]*Canvas, error) {
		fs, err := src(env)
		if err != nil {
			return nil, err
		}
		for i := range fs {
			fs[i] = f(fs[i])
		}
		return fs, nil
	}
}

// procedural envuelve funciones que dibujan los frames en código.
func procedural(f func() ([]*Canvas, error)) frameSource {
	return func(*objEnv) ([]*Canvas, error) { return f() }
}

// one adapta una función de un solo frame.
func one(f func() (*Canvas, error)) func() ([]*Canvas, error) {
	return func() ([]*Canvas, error) {
		c, err := f()
		if err != nil {
			return nil, err
		}
		return []*Canvas{c}, nil
	}
}

const (
	packIndoor = "kenney-roguelike-indoors"
	packRPG    = "kenney-roguelike-rpg-pack"
	fileIndoor = "roguelikeIndoor_transparent.png"
	fileRPG    = "roguelikeSheet_transparent.png"
)

// kenney recorta tiles (col, row) de una hoja con 1 px de margen y los pone
// en fila, recoloreados a la paleta Caribe.
func kenney(pack, file string, tiles ...[2]int) frameSource {
	return func(env *objEnv) ([]*Canvas, error) {
		img, err := env.sheet(pack, file)
		if err != nil {
			return nil, err
		}
		c := NewCanvas(16*len(tiles), 16)
		for i, t := range tiles {
			c.Blit(quantize(img, t[0]*17, t[1]*17, 16, 16), i*16, 0)
		}
		if c.Empty() {
			return nil, fmt.Errorf("vendor %s: recorte vacío %v", pack, tiles)
		}
		return []*Canvas{c}, nil
	}
}

// kenneyColumn recorta tiles apilados en vertical.
func kenneyColumn(pack, file string, col, row, rows int) frameSource {
	return func(env *objEnv) ([]*Canvas, error) {
		img, err := env.sheet(pack, file)
		if err != nil {
			return nil, err
		}
		c := NewCanvas(16, 16*rows)
		for r := 0; r < rows; r++ {
			c.Blit(quantize(img, col*17, (row+r)*17, 16, 16), 0, 16*r)
		}
		return []*Canvas{c}, nil
	}
}

func (env *objEnv) sheet(pack, file string) (image.Image, error) {
	key := pack + "/" + file
	if img := env.sheets[key]; img != nil {
		return img, nil
	}
	img, err := loadPNG(filepath.Join(env.vendor, pack, file))
	if err != nil {
		return nil, fmt.Errorf("vendor %s: %w", key, err)
	}
	env.sheets[key] = img
	return img, nil
}

// Etiquetas de capa para el renderer: floor (se ordena por Y con los
// personajes), under (va pegado al piso, debajo de todo), wall (colgado en
// un muro), ceiling (encima de todo), repeat (se repite en la huella).
var (
	tFloor   = []string{"floor"}
	tUnder   = []string{"under"}
	tWall    = []string{"wall"}
	tCeiling = []string{"ceiling"}
)

func pt(x, y int) *Point { return &Point{x, y} }

// decorCatalog es el catálogo de decoración del mapa.
func decorCatalog() []decorDef {
	bed := grids("obj_bed")
	bedV := grids("obj_bed_v")
	return []decorDef{
		// Habitaciones. La cama ocupa 2 tiles desde la cabecera (tx, ty).
		// El paciente acostado sale de la fila de la hoja de personajes que
		// corresponde a la dirección de la cama (sin girar en el canvas).
		{Key: "bed:right", Src: bed, Footprint: Size{2, 1}, Origin: pt(0, 0), Ride: &Ride{14, 4, 0, false}, Sit: pt(10, 2),
			Mattress: &Rect{5, 0, 22, 14}, Cover: &Rect{17, 0, 10, 14}, Tags: tFloor, Source: "propio"},
		{Key: "bed:left", Src: transformed(bed, (*Canvas).Mirror), Footprint: Size{2, 1}, Origin: pt(16, 0), Ride: &Ride{18, 4, 0, false}, Sit: pt(22, 2),
			Mattress: &Rect{5, 0, 22, 14}, Cover: &Rect{5, 0, 10, 14}, Tags: tFloor, Source: "propio"},
		{Key: "bed:down", Src: bedV, Footprint: Size{1, 2}, Origin: pt(0, 0), Ride: &Ride{8, 13, 0, false}, Sit: pt(8, 10),
			Mattress: &Rect{1, 4, 14, 23}, Cover: &Rect{1, 18, 14, 9}, Tags: tFloor, Source: "propio"},
		{Key: "bed:up", Src: transformed(bedV, (*Canvas).FlipV), Footprint: Size{1, 2}, Origin: pt(0, 16), Ride: &Ride{8, 19, 0, false}, Sit: pt(8, 22),
			Mattress: &Rect{1, 5, 14, 23}, Cover: &Rect{1, 5, 14, 9}, Tags: tFloor, Source: "propio"},
		{Key: "monitor", Src: grids("obj_monitor_0", "obj_monitor_1", "obj_monitor_2"), FPS: 4, Tags: tFloor, Source: "propio"},
		{Key: "nightstand", Src: kenney(packIndoor, fileIndoor, [2]int{0, 12}), Tags: tFloor, Source: packIndoor},
		{Key: "plant", Src: kenney(packIndoor, fileIndoor, [2]int{16, 0}), Tags: tFloor, Source: packIndoor},
		{Key: "toilet", Src: grids("obj_toilet"), Tags: tFloor, Source: "propio"},
		{Key: "sink", Src: kenney(packIndoor, fileIndoor, [2]int{8, 13}), Tags: tFloor, Source: packIndoor},
		{Key: "shelf", Src: kenney(packIndoor, fileIndoor, [2]int{5, 12}), Tags: tFloor, Source: packIndoor},
		{Key: "linenCart", Src: grids("obj_linenCart"), Tags: tFloor, Source: "propio"},
		{Key: "doorNumber", Src: grids("obj_doorNumber"), Origin: pt(0, -3), Tags: tWall, Source: "propio"},
		// Sala de espera.
		{Key: "chair", Src: grids("obj_rimax"), Tags: tFloor, Source: "propio"},
		{Key: "tv", Src: grids("obj_tv_0", "obj_tv_1", "obj_tv_2"), FPS: 3, Origin: pt(0, -2), Tags: tWall, Source: "propio"},
		{Key: "pico", Src: grids("obj_pico_0", "obj_pico_1"), FPS: 4, Tags: tFloor, Source: "propio"},
		{Key: "mural@3x1", Src: procedural(one(mural)), Footprint: Size{3, 1}, Origin: pt(0, 0), Tags: tWall, Source: "propio"},
		{Key: "rug@3x2", Src: procedural(one(wayuuRug)), Footprint: Size{3, 2}, Origin: pt(0, 0), Tags: tUnder, Source: "propio"},
		// Recepción y entrada.
		{Key: "counter", Src: kenney(packIndoor, fileIndoor, [2]int{1, 12}), Tags: []string{"floor", "repeat"}, Source: packIndoor},
		{Key: "bell", Src: grids("obj_bell"), Tags: tFloor, Source: "propio"},
		{Key: "deskChair", Src: kenney(packIndoor, fileIndoor, [2]int{2, 2}), Tags: tFloor, Source: packIndoor},
		{Key: "receptionSign", Src: procedural(one(signReception)), Tags: tWall, Source: "propio"},
		{Key: "glassDoor", Src: grids("tile_puerta"), Origin: pt(0, 0), Tags: tWall, Source: "propio"},
		{Key: "doormat", Src: grids("tile_tapete"), Origin: pt(0, 0), Tags: tUnder, Source: "propio"},
		// Pasillo principal.
		{Key: "noSleepSign", Src: procedural(one(signNoSleep)), Tags: tWall, Source: "propio"},
		{Key: "water", Src: grids("obj_water"), Tags: tWall, Source: "propio"},
		{Key: "bench", Src: transformed(grids("obj_bench_2x1"), func(c *Canvas) *Canvas { return benchSingle(c) }), Tags: tFloor, Source: "propio"},
		{Key: "bench@2x1", Src: grids("obj_bench_2x1"), Footprint: Size{2, 1}, Tags: tFloor, Source: "propio"},
		{Key: "extinguisher", Src: grids("obj_extinguisher"), Origin: pt(0, -1), Tags: tWall, Source: "propio"},
		{Key: "fan", Src: procedural(func() ([]*Canvas, error) { return fanFrames(), nil }), FPS: 10, Tags: tCeiling, Source: "propio"},
		// Exterior.
		{Key: "palm", Src: procedural(func() ([]*Canvas, error) { return []*Canvas{palmFrame()}, nil }), Tags: tFloor, Source: "propio"},
		{Key: "sign@2x1", Src: procedural(one(signEntrance)), Footprint: Size{2, 1}, Tags: tFloor, Source: "propio"},
		{Key: "flowers", Src: kenney(packRPG, fileRPG, [2]int{24, 10}), Tags: tFloor, Source: packRPG},
		{Key: "gate", Src: grids("obj_gate"), Tags: tFloor, Source: "propio"},
		{Key: "arbol", Src: kenney(packRPG, fileRPG, [2]int{13, 9}), Tags: tFloor, Source: packRPG},
		{Key: "arbol@1x2", Src: kenneyColumn(packRPG, fileRPG, 13, 10, 2), Footprint: Size{1, 2}, Tags: tFloor, Source: packRPG},
		{Key: "arbusto", Src: kenney(packRPG, fileRPG, [2]int{19, 9}), Tags: tFloor, Source: packRPG},
		{Key: "cactus", Src: kenney(packRPG, fileRPG, [2]int{22, 9}), Tags: tFloor, Source: packRPG},
		// Cafetería.
		{Key: "table", Src: kenney(packIndoor, fileIndoor, [2]int{7, 0}), Tags: tFloor, Source: packIndoor},
		{Key: "table@2x1", Src: kenney(packIndoor, fileIndoor, [2]int{0, 0}, [2]int{2, 0}), Footprint: Size{2, 1}, Tags: tFloor, Source: packIndoor},
		{Key: "coffeeCart", Src: grids("obj_coffeeCart"), Tags: tFloor, Source: "propio"},
		{Key: "menuBoard", Src: procedural(one(menuBoard)), Tags: tWall, Source: "propio"},
		// Sala de personal.
		{Key: "hammock@2x1", Src: procedural(one(hammock)), Footprint: Size{2, 1}, Tags: tFloor, Source: "propio"},
		{Key: "fridge", Src: grids("obj_fridge"), Tags: tFloor, Source: "propio"},
		{Key: "board", Src: grids("obj_board"), Origin: pt(0, -1), Tags: tWall, Source: "propio"},
		{Key: "locker@1x2", Src: grids("obj_locker_1x2"), Footprint: Size{1, 2}, Tags: tFloor, Source: "propio"},
		// Base de las camillas.
		{Key: "charger", Src: grids("obj_charger"), Origin: pt(0, 0), Tags: tWall, Source: "propio"},
		{Key: "chargePad", Src: grids("obj_chargePad"), Origin: pt(0, 0), Tags: tUnder, Source: "propio"},
		{Key: "toolShelf@1x2", Src: grids("obj_toolShelf_1x2"), Footprint: Size{1, 2}, Tags: tFloor, Source: "propio"},
		{Key: "workbench@1x2", Src: grids("obj_workbench_1x2"), Footprint: Size{1, 2}, Tags: tFloor, Source: "propio"},
		// Extras que el mapa no pide todavía.
		{Key: "matera-2", Src: kenney(packIndoor, fileIndoor, [2]int{17, 0}), Tags: tFloor, Source: packIndoor},
		{Key: "cuadro", Src: kenney(packIndoor, fileIndoor, [2]int{18, 0}), Tags: tWall, Source: packIndoor},
		{Key: "botiquin", Src: kenney(packIndoor, fileIndoor, [2]int{6, 12}), Tags: tFloor, Source: packIndoor},
		{Key: "silla-madera", Src: kenney(packIndoor, fileIndoor, [2]int{0, 2}), Tags: tFloor, Source: packIndoor},
	}
}

// DecorKinds son los "kind" de la decoración del mapa (feature/gui-world)
// que el catálogo debe cubrir; lo verifica un test.
var DecorKinds = []string{
	"bed", "bell", "bench", "board", "chair", "chargePad", "charger", "coffeeCart", "counter",
	"deskChair", "doorNumber", "doormat", "extinguisher", "fan", "flowers", "fridge", "gate",
	"glassDoor", "hammock", "linenCart", "locker", "menuBoard", "monitor", "mural", "nightstand",
	"noSleepSign", "palm", "pico", "plant", "receptionSign", "rug", "shelf", "sign", "sink",
	"table", "toilet", "toolShelf", "tv", "water", "workbench",
}

// benchSingle arma la banca de un tile con los extremos de la de dos.
func benchSingle(c *Canvas) *Canvas {
	out := NewCanvas(16, 16)
	out.Blit(c.Crop(0, 0, 8, 16), 0, 0)
	out.Blit(c.Crop(24, 0, 8, 16), 8, 0)
	return out
}

// loadPNG lee un PNG cualquiera.
func loadPNG(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return png.Decode(f)
}

// quantize recorta (x, y, w, h) de img y lo lleva a la paleta Caribe: cada
// pixel opaco toma el color más cercano y el resto queda transparente.
func quantize(img image.Image, x0, y0, w, h int) *Canvas {
	c := NewCanvas(w, h)
	b := img.Bounds()
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			px := image.Pt(b.Min.X+x0+x, b.Min.Y+y0+y)
			if !px.In(b) {
				continue
			}
			col := img.At(px.X, px.Y)
			if _, _, _, a := col.RGBA(); a < 0x8000 {
				continue
			}
			c.Set(x, y, nearest(col))
		}
	}
	return c
}

// addSprite registra un sprite de frames en fila y devuelve su entrada.
func addSprite(out *Output, rel string, frames []*Canvas, fps float64) (SpriteEntry, error) {
	if len(frames) == 0 {
		return SpriteEntry{}, fmt.Errorf("%s: sin frames", rel)
	}
	w, h := frames[0].W, frames[0].H
	sheet := NewCanvas(w*len(frames), h)
	for i, f := range frames {
		if f.W != w || f.H != h {
			return SpriteEntry{}, fmt.Errorf("%s: el frame %d mide %dx%d y el primero %dx%d", rel, i, f.W, f.H, w, h)
		}
		sheet.Blit(f, i*w, 0)
	}
	if err := out.PNG(rel, sheet); err != nil {
		return SpriteEntry{}, err
	}
	return SpriteEntry{Sheet: rel, Frame: Size{w, h}, Frames: len(frames), FPS: fps}, nil
}

// fileName convierte una clave ("bed:down", "rug@3x2") en nombre de archivo.
func fileName(key string) string {
	b := []byte(key)
	for i, c := range b {
		if c == ':' || c == '@' {
			b[i] = '-'
		}
	}
	return string(b)
}

func buildObjects(gs map[string]*Grid, vendor string, m *Manifest, out *Output) error {
	env := &objEnv{grids: gs, vendor: vendor, sheets: map[string]image.Image{}}
	for _, d := range decorCatalog() {
		frames, err := d.Src(env)
		if err != nil {
			return fmt.Errorf("objeto %s: %w", d.Key, err)
		}
		e, err := addSprite(out, "generated/objects/"+fileName(d.Key)+".png", frames, d.FPS)
		if err != nil {
			return err
		}
		fp := d.Footprint
		if fp.W == 0 {
			fp = Size{1, 1}
		}
		o := d.Origin
		if o == nil {
			// Centrado en la huella y apoyado en su borde de abajo.
			o = pt((e.Frame.W-fp.W*16)/2, e.Frame.H-fp.H*16)
		}
		e.Origin, e.Footprint, e.Ride, e.Tags, e.Source = o, &fp, d.Ride, d.Tags, d.Source
		e.Sit, e.Mattress, e.Cover = d.Sit, d.Mattress, d.Cover
		if _, dup := m.Objects[d.Key]; dup {
			return fmt.Errorf("objeto repetido %q", d.Key)
		}
		m.Objects[d.Key] = e
	}
	// Entidades que se mueven: robot, camilla y sombra.
	movers := []struct {
		dst    *SpriteEntry
		file   string
		grids  []string
		fps    float64
		anchor *Point
		ride   *Ride
		tags   []string
	}{
		{&m.Robot, "robot", []string{"obj_robot_0", "obj_robot_1"}, 4, pt(13, 14), &Ride{11, 0, 0, false}, []string{"carrier"}},
		{&m.Stretcher, "camilla", []string{"obj_camilla"}, 0, pt(10, 15), &Ride{11, -1, 0, false}, []string{"carrier"}},
		{&m.Shadow, "sombra", []string{"obj_sombra"}, 0, pt(6, 2), nil, []string{"shadow"}},
	}
	for _, mv := range movers {
		fs, err := grids(mv.grids...)(env)
		if err != nil {
			return err
		}
		e, err := addSprite(out, "generated/objects/"+mv.file+".png", fs, mv.fps)
		if err != nil {
			return err
		}
		e.Anchor, e.Ride, e.Tags, e.Source = mv.anchor, mv.ride, mv.tags, "propio"
		*mv.dst = e
	}
	return nil
}

// objectKinds devuelve las claves sin variante (para validar cobertura).
func objectKinds(m *Manifest) []string {
	seen := map[string]bool{}
	for k := range m.Objects {
		base := k
		for i, c := range k {
			if c == ':' || c == '@' {
				base = k[:i]
				break
			}
		}
		seen[base] = true
	}
	var out []string
	for k := range seen {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// outline pinta de color los pixeles transparentes que tocan (en cruz) a un
// pixel pintado.
func outline(c *Canvas, color int) *Canvas {
	out := NewCanvas(c.W, c.H)
	out.Blit(c, 0, 0)
	for y := 0; y < c.H; y++ {
		for x := 0; x < c.W; x++ {
			if c.Get(x, y) != Transparent {
				continue
			}
			if c.Get(x-1, y) != Transparent || c.Get(x+1, y) != Transparent ||
				c.Get(x, y-1) != Transparent || c.Get(x, y+1) != Transparent {
				out.Set(x, y, color)
			}
		}
	}
	return out
}

// fanFrames dibuja el ventilador de techo visto desde abajo: 4 aspas de
// madera que giran 30° por frame (con 4 aspas, 90° vuelve al inicio).
func fanFrames() []*Canvas {
	var frames []*Canvas
	for k := 0; k < 3; k++ {
		c := NewCanvas(16, 16)
		for b := 0; b < 4; b++ {
			a := float64(k)*math.Pi/6 + float64(b)*math.Pi/2
			for r := 2.0; r <= 6.5; r += 0.25 {
				x := 7.5 + r*math.Cos(a)
				y := 7.5 + r*math.Sin(a)
				col := n("madera-clara")
				if r > 5.5 {
					col = n("madera-oscura")
				}
				c.Set(int(math.Round(x)), int(math.Round(y)), col)
				c.Set(int(math.Round(x-0.9*math.Sin(a))), int(math.Round(y+0.9*math.Cos(a))), n("madera-oscura"))
			}
		}
		c = outline(c, n("tinta"))
		for y := 6; y <= 9; y++ {
			for x := 6; x <= 9; x++ {
				if (x == 6 || x == 9) && (y == 6 || y == 9) {
					continue
				}
				v := n("gris-claro")
				if x == 6 || x == 9 || y == 6 || y == 9 {
					v = n("tinta")
				}
				c.Set(x, y, v)
			}
		}
		c.Set(7, 7, n("blanco"))
		frames = append(frames, c)
	}
	return frames
}

// palmFrame dibuja una palmera de 32×48: tronco curvo con anillos y
// pencas que caen, más tres cocos.
func palmFrame() *Canvas {
	c := NewCanvas(32, 48)
	for y := 14; y <= 46; y++ {
		t := float64(y-14) / 32
		x := int(math.Round(16 - 3*t*t + 1.5*math.Sin(t*math.Pi)))
		for dx := 0; dx < 4; dx++ {
			col := n("madera-clara")
			switch {
			case (y-14)%4 == 0, dx == 0:
				col = n("madera-oscura")
			case dx == 3:
				col = n("arena")
			}
			c.Set(x-1+dx, y, col)
		}
	}
	fronds := []struct{ a, l, droop float64 }{
		{math.Pi, 14, 7}, {0, 14, 7}, {-2.5, 11, 3}, {-0.64, 11, 3}, {-1.9, 8, 1}, {-1.2, 8, 1}, {2.3, 9, 4}, {0.8, 9, 4},
	}
	cx, cy := 16.0, 13.0
	for _, f := range fronds {
		for t := 0.0; t <= f.l; t += 0.2 {
			x := cx + math.Cos(f.a)*t
			y := cy + math.Sin(f.a)*t + f.droop*(t/f.l)*(t/f.l)
			c.Set(int(math.Round(x)), int(math.Round(y)), n("verde-tropical"))
			w := 2.2 * math.Sin(math.Pi*t/f.l)
			for s := 1.0; s <= w; s++ {
				c.Set(int(math.Round(x)), int(math.Round(y+s)), n("verde-oscuro"))
				c.Set(int(math.Round(x)), int(math.Round(y-s+0.4)), n("verde-lima"))
			}
		}
	}
	c = outline(c, n("tinta"))
	for _, p := range [][2]int{{14, 15}, {17, 15}, {15, 16}} {
		c.Set(p[0], p[1], n("cafe-pelo"))
		c.Set(p[0]+1, p[1], n("madera-oscura"))
		c.Set(p[0], p[1]+1, n("madera-oscura"))
		c.Set(p[0]+1, p[1]+1, n("cafe-pelo"))
	}
	return c
}

// signPanel pinta un letrero rectangular con borde doble y líneas de texto
// centradas; extraLeft deja espacio a la izquierda para un ícono.
func signPanel(lines []string, extraLeft, padY int, bg, frame, ink int) (*Canvas, error) {
	tw := 0
	for _, l := range lines {
		if w := textWidth(l); w > tw {
			tw = w
		}
	}
	w := tw + extraLeft + 8
	h := len(lines)*7 + 4 + 2*padY
	c := NewCanvas(w, h)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			v := bg
			if x == 0 || y == 0 || x == w-1 || y == h-1 {
				v = n("tinta")
			} else if x == 1 || y == 1 || x == w-2 || y == h-2 {
				v = frame
			}
			c.Set(x, y, v)
		}
	}
	for i, l := range lines {
		x := 4 + extraLeft + (tw-textWidth(l))/2
		if err := drawText(c, l, x, 3+padY+i*7, ink); err != nil {
			return nil, err
		}
	}
	return c, nil
}

// signNoSleep: "SE PROHÍBE DORMIR EN EL PASILLO", aviso de prohibición.
func signNoSleep() (*Canvas, error) {
	return signPanel([]string{"SE PROHÍBE DORMIR", "EN EL PASILLO"}, 0, 0, n("blanco"), n("rojo-junior"), n("tinta"))
}

// signReception: "RECEPCIÓN" en azul mar.
func signReception() (*Canvas, error) {
	return signPanel([]string{"RECEPCIÓN"}, 0, 0, n("azul-mar"), n("celeste"), n("blanco"))
}

// signEntrance: letrero de la entrada con el nombre del hospital (tal cual,
// en mayúsculas de letrero), una cruz y dos postes.
func signEntrance() (*Canvas, error) {
	panel, err := signPanel([]string{"HOSPITAL DE LOS", "COSTEÑOS CON", "NARCOLEPSIA"}, 10, 0, n("azul-mar"), n("blanco"), n("blanco"))
	if err != nil {
		return nil, err
	}
	cy := panel.H / 2
	for y := -3; y <= 3; y++ {
		for x := -3; x <= 3; x++ {
			ax, ay := abs(x), abs(y)
			if (ax <= 1 && ay <= 3) || (ay <= 1 && ax <= 3) {
				v := n("rojo-junior")
				if ax == 0 || ay == 0 {
					v = n("blanco")
				}
				panel.Set(7+x, cy+y, v)
			}
		}
	}
	const post = 6
	c := NewCanvas(panel.W, panel.H+post)
	for _, px := range []int{8, panel.W - 12} {
		for y := panel.H; y < panel.H+post; y++ {
			c.Set(px, y, n("tinta"))
			c.Set(px+1, y, n("madera-clara"))
			c.Set(px+2, y, n("madera-oscura"))
			c.Set(px+3, y, n("tinta"))
		}
	}
	c.Blit(panel, 0, 0)
	return c, nil
}

// menuBoard: tablero de tiza con "MENÚ" y renglones.
func menuBoard() (*Canvas, error) {
	c, err := signPanel([]string{"MENÚ"}, 0, 0, n("verde-oscuro"), n("madera-oscura"), n("blanco"))
	if err != nil {
		return nil, err
	}
	out := NewCanvas(c.W, c.H+5)
	out.Blit(c, 0, 0)
	for y := c.H - 2; y < out.H; y++ {
		for x := 0; x < c.W; x++ {
			v := n("verde-oscuro")
			if x == 0 || x == c.W-1 || y == out.H-1 {
				v = n("tinta")
			} else if x == 1 || x == c.W-2 || y == out.H-2 {
				v = n("madera-oscura")
			} else if (y == c.H || y == c.H+2) && x > 3 && x < c.W-4 && (x/3)%2 == 0 {
				v = n("gris-claro")
			}
			out.Set(x, y, v)
		}
	}
	return out, nil
}

// mural: playa caribe pintada en la pared (48×16).
func mural() (*Canvas, error) {
	c := NewCanvas(48, 16)
	for y := 0; y < 16; y++ {
		for x := 0; x < 48; x++ {
			v := n("celeste")
			switch {
			case x == 0 || y == 0 || x == 47 || y == 15:
				v = n("tinta")
			case x == 1 || y == 1 || x == 46 || y == 14:
				v = n("madera-oscura")
			case y >= 11:
				v = n("arena")
			case y >= 8:
				v = n("azul-mar")
				if (x+y)%7 == 0 {
					v = n("blanco")
				}
			}
			c.Set(x, y, v)
		}
	}
	for y := 2; y <= 6; y++ {
		for x := 37; x <= 43; x++ {
			if (x-40)*(x-40)+(y-4)*(y-4) <= 5 {
				c.Set(x, y, n("sol"))
			}
		}
	}
	for y := 5; y <= 12; y++ {
		c.Set(11+(12-y)/4, y, n("madera-oscura"))
	}
	for _, p := range [][2]int{{9, 4}, {10, 4}, {12, 4}, {13, 4}, {14, 5}, {8, 5}, {11, 3}, {15, 6}, {7, 6}} {
		c.Set(p[0], p[1], n("verde-oscuro"))
	}
	for y := 4; y <= 8; y++ {
		for x := 24; x <= 24+(y-4); x++ {
			c.Set(x, y, n("blanco"))
		}
	}
	for x := 23; x <= 29; x++ {
		c.Set(x, 9, n("rojo-junior"))
	}
	return c, nil
}

// wayuuRug: tapete de 48×32 con franjas en zigzag de colores wayuu.
func wayuuRug() (*Canvas, error) {
	c := NewCanvas(48, 32)
	bands := []int{n("rojo-junior"), n("sol"), n("azul-mar"), n("verde-tropical"), n("naranja"), n("morado")}
	for y := 0; y < 32; y++ {
		for x := 0; x < 48; x++ {
			var v int
			switch {
			case x == 0 || y == 0 || x == 47 || y == 31:
				v = n("tinta")
			case x <= 2 || y <= 2 || x >= 45 || y >= 29:
				v = n("rojo-oscuro")
			default:
				z := abs(((x+4)%8)-4) - 2
				k := y - 3 + z + 64
				v = bands[(k/4)%len(bands)]
				if k%4 == 0 {
					v = n("blanco-calido")
				}
			}
			c.Set(x, y, v)
		}
	}
	return c, nil
}

// hammock: hamaca de colores colgada entre dos postes (32×16).
func hammock() (*Canvas, error) {
	c := NewCanvas(32, 16)
	stripes := []int{n("rojo-junior"), n("sol"), n("azul-mar"), n("blanco"), n("verde-tropical")}
	for x := 3; x <= 28; x++ {
		t := float64(x-3) / 25
		top := 3 + int(math.Round(5*math.Sin(math.Pi*t)))
		for y := top; y < top+4; y++ {
			c.Set(x, y, stripes[(x/3)%len(stripes)])
		}
		if x%2 == 0 {
			c.Set(x, top+4, n("sol"))
		}
	}
	for _, p := range [][2]int{{2, 3}, {2, 4}, {29, 3}, {29, 4}} {
		c.Set(p[0], p[1], n("arena"))
	}
	c = outline(c, n("tinta"))
	for _, px := range []int{0, 30} {
		for y := 1; y < 16; y++ {
			c.Set(px, y, n("madera-oscura"))
			c.Set(px+1, y, n("madera-clara"))
		}
		c.Set(px, 0, n("tinta"))
		c.Set(px+1, 0, n("tinta"))
	}
	return c, nil
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
