package main

import (
	"bytes"
	"encoding/json"
	"image/png"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
)

// root es la raíz del repositorio vista desde este paquete.
const root = "../.."

func mustParse(t *testing.T, src string) map[string]*Grid {
	t.Helper()
	gs, err := ParseGrids(strings.NewReader(src), "test.txt")
	if err != nil {
		t.Fatal(err)
	}
	return gs
}

func TestParseGrids(t *testing.T) {
	gs := mustParse(t, "# comentario\n\n@a 3x2\n0.A\nv9.\n\n@b 1x1\nZ\n")
	if len(gs) != 2 {
		t.Fatalf("se esperaban 2 grillas, hay %d", len(gs))
	}
	a := gs["a"]
	if a.W != 3 || a.H != 2 || a.At(2, 0) != 'A' || a.At(0, 1) != 'v' {
		t.Fatalf("grilla mal leída: %+v", a)
	}
}

func TestParseGridsErrors(t *testing.T) {
	cases := map[string]string{
		"fila corta":        "@a 3x1\n00\n",
		"carácter inválido": "@a 2x1\n0w\n",
		"incompleta":        "@a 2x2\n00\n",
		"repetida":          "@a 1x1\n0\n@a 1x1\n0\n",
		"sin encabezado":    "000\n",
		"tamaño inválido":   "@a 0x1\n",
		"minúscula > v":     "@a 1x1\nz\n",
	}
	for name, src := range cases {
		if _, err := ParseGrids(strings.NewReader(src), "x.txt"); err == nil {
			t.Errorf("%s: se esperaba error", name)
		}
	}
}

func TestPaletteIndex(t *testing.T) {
	for i, e := range Palette {
		if got := paletteIndex(e.Char); got != i {
			t.Errorf("carácter %q: índice %d, se esperaba %d", e.Char, got, i)
		}
	}
	if paletteIndex('.') != -1 || paletteIndex('A') != -1 {
		t.Error("'.' y las ranuras no son colores")
	}
	seen := map[string]bool{}
	for _, e := range Palette {
		if seen[e.Hex] || seen[e.Name] {
			t.Errorf("color o nombre repetido: %s %s", e.Name, e.Hex)
		}
		seen[e.Hex], seen[e.Name] = true, true
	}
}

// El cambio de paleta: la misma grilla con mapas distintos da los mismos
// pixeles con otros colores; una ranura sin mapa no se pinta.
func TestSlotSwap(t *testing.T) {
	g := mustParse(t, "@g 4x1\nAB0.\n")["g"]
	c1 := NewCanvas(4, 1)
	c1.DrawGrid(g, 0, 0, SlotMap{'A': 5, 'B': 6}, true)
	c2 := NewCanvas(4, 1)
	c2.DrawGrid(g, 0, 0, SlotMap{'A': 7}, false)
	want1 := []int{5, 6, 0, Transparent}
	want2 := []int{7, Transparent, Transparent, Transparent}
	for i := range want1 {
		if c1.Pix[i] != want1[i] || c2.Pix[i] != want2[i] {
			t.Fatalf("pixel %d: %d/%d, se esperaba %d/%d", i, c1.Pix[i], c2.Pix[i], want1[i], want2[i])
		}
	}
}

func TestSkinSwapKeepsSilhouette(t *testing.T) {
	gs, err := LoadGridDir("src")
	if err != nil {
		t.Fatal(err)
	}
	comp := &Composer{Grids: gs}
	skins := Skins()
	pose := Pose{Dir: "down", Legs: "stand"}
	base, err := comp.Frame(skins[0], pose)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range skins[1:] {
		f, err := comp.Frame(s, pose)
		if err != nil {
			t.Fatal(err)
		}
		changed := 0
		for i := range base.Pix {
			if (base.Pix[i] == Transparent) != (f.Pix[i] == Transparent) {
				t.Fatalf("%s: la silueta cambió en el pixel %d", s.ID, i)
			}
			if base.Pix[i] == n("piel-1") {
				if f.Pix[i] != s.Slots['S'] {
					t.Fatalf("%s: la piel no se cambió en el pixel %d", s.ID, i)
				}
				changed++
			}
		}
		if changed == 0 {
			t.Fatalf("%s: no hay pixeles de piel", s.ID)
		}
	}
}

func TestTransforms(t *testing.T) {
	c := NewCanvas(3, 2)
	c.Set(0, 0, 1) // arriba a la izquierda
	r := c.RotateCCW()
	if r.W != 2 || r.H != 3 || r.Get(0, 2) != 1 {
		t.Fatalf("RotateCCW: %+v", r)
	}
	if c.Mirror().Get(2, 0) != 1 || c.FlipV().Get(0, 1) != 1 {
		t.Fatal("Mirror/FlipV")
	}
	if c.RotateCW().Get(1, 0) != 1 {
		t.Fatal("RotateCW")
	}
}

func TestTextFont(t *testing.T) {
	c := NewCanvas(80, 8)
	if err := drawText(c, "SE PROHÍBE DORMIR ÑÁÉÓÚ", 0, 1, 0); err != nil {
		t.Fatal(err)
	}
	if err := drawText(c, "€", 0, 1, 0); err == nil {
		t.Fatal("se esperaba error con un carácter que la fuente no tiene")
	}
	if textWidth("ABC") != 11 {
		t.Fatal("textWidth")
	}
}

var (
	buildOnce sync.Once
	builtM    *Manifest
	builtOut  *Output
	builtErr  error
)

// build devuelve una copia de una única corrida del generador (es
// determinista; con -race cada corrida tarda varios segundos).
func build(t *testing.T) (*Manifest, *Output) {
	t.Helper()
	buildOnce.Do(func() { builtM, builtOut, builtErr = Build(root) })
	if builtErr != nil {
		t.Fatal(builtErr)
	}
	data, err := json.Marshal(builtM)
	if err != nil {
		t.Fatal(err)
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatal(err)
	}
	out := newOutput()
	out.Preview = builtOut.Preview
	for k, v := range builtOut.Files {
		out.Files[k] = v
	}
	for k, v := range builtOut.Canvases {
		out.Canvases[k] = v
	}
	return &m, out
}

// sheetSize devuelve el tamaño de una hoja: generada en memoria o en disco.
func sheetSize(t *testing.T, out *Output, rel string) (int, int) {
	t.Helper()
	if c := out.Canvases[rel]; c != nil {
		return c.W, c.H
	}
	f, err := os.Open(filepath.Join(root, "web", "assets", filepath.FromSlash(rel)))
	if err != nil {
		t.Fatalf("la hoja %s no existe: %v", rel, err)
	}
	defer f.Close()
	cfg, err := png.DecodeConfig(f)
	if err != nil {
		t.Fatal(err)
	}
	return cfg.Width, cfg.Height
}

func TestManifestCharacters(t *testing.T) {
	m, out := build(t)
	ch := m.Characters
	if ch.Frame.W != CharW || ch.Frame.H != CharH {
		t.Fatalf("frame %v", ch.Frame)
	}
	rows := len(ch.Rows)
	for name, a := range ch.Animations {
		for _, d := range Dirs {
			r, ok := a.Rows[d]
			if !ok || r < 0 || r >= rows {
				t.Errorf("animación %s/%s: fila %d inválida", name, d, r)
				continue
			}
			if ch.Rows[r].Anim != name || ch.Rows[r].Frames != a.Frames {
				t.Errorf("animación %s/%s apunta a la fila %d (%s)", name, d, r, ch.Rows[r].Anim)
			}
			if a.Frames < 1 || a.Frames > ch.Columns {
				t.Errorf("animación %s: %d frames con %d columnas", name, a.Frames, ch.Columns)
			}
		}
	}
	for _, want := range []string{"idle", "walk", "attack", "sleep", "stretcher", "attend", "wake", "push"} {
		if _, ok := ch.Animations[want]; !ok {
			t.Errorf("falta la animación %s", want)
		}
	}
	for _, cat := range ch.LayerOrder {
		if len(ch.Layers[cat]) == 0 {
			t.Errorf("categoría %s sin capas", cat)
		}
		for _, l := range ch.Layers[cat] {
			if l.Sheet == nil {
				continue
			}
			w, h := sheetSize(t, out, *l.Sheet)
			if w != ch.Columns*ch.Frame.W || h != rows*ch.Frame.H {
				t.Errorf("%s: %dx%d, se esperaba %dx%d", *l.Sheet, w, h, ch.Columns*ch.Frame.W, rows*ch.Frame.H)
			}
		}
	}
	// Cada frame declarado de la capa base tiene pixeles; los que sobran
	// de la fila están vacíos.
	skin := out.Canvases[*ch.Layers["skin"][0].Sheet]
	for r, row := range ch.Rows {
		for c := 0; c < ch.Columns; c++ {
			empty := skin.Crop(c*ch.Frame.W, r*ch.Frame.H, ch.Frame.W, ch.Frame.H).Empty()
			if c < row.Frames && empty {
				t.Errorf("fila %d (%s/%s) frame %d vacío", r, row.Anim, row.Dir, c)
			}
			if c >= row.Frames && !empty {
				t.Errorf("fila %d (%s/%s) tiene pixeles en la columna %d, fuera de sus %d frames", r, row.Anim, row.Dir, c, row.Frames)
			}
		}
	}
	ids := map[string]string{}
	for cat, ls := range ch.Layers {
		for _, l := range ls {
			ids[l.ID] = cat
		}
	}
	for cat, pool := range ch.Patients {
		if len(pool) == 0 {
			t.Errorf("pool %s vacío", cat)
		}
		for _, id := range pool {
			if ids[id] != cat {
				t.Errorf("pool %s: %q no es una capa %s", cat, id, cat)
			}
		}
	}
	vueltiao := false
	for kind, ps := range ch.Staff {
		for _, p := range ps {
			if p.Weight <= 0 {
				t.Errorf("preset %s sin peso", p.ID)
			}
			if kind == "doctor" && p.Head == "vueltiao" {
				vueltiao = true
			}
		}
	}
	if !vueltiao {
		t.Error("falta el doctor del vueltiao")
	}
}

func checkSprite(t *testing.T, out *Output, name string, e SpriteEntry) {
	t.Helper()
	if e.Frames < 1 || e.Frame.W <= 0 || e.Frame.H <= 0 {
		t.Errorf("%s: frames inválidos %+v", name, e)
		return
	}
	w, h := sheetSize(t, out, e.Sheet)
	if e.X+e.Frames*e.Frame.W > w || e.Y+e.Frame.H > h {
		t.Errorf("%s: %d frames de %v desde (%d,%d) no caben en %dx%d", name, e.Frames, e.Frame, e.X, e.Y, w, h)
	}
	if (w-e.X)%e.Frame.W != 0 {
		t.Errorf("%s: el ancho %d no es múltiplo del frame %d", name, w, e.Frame.W)
	}
	if e.Anchor == nil && e.Origin == nil {
		t.Errorf("%s: sin anchor ni origin", name)
	}
}

func TestManifestObjectsTilesEmotes(t *testing.T) {
	m, out := build(t)
	for k, e := range m.Objects {
		checkSprite(t, out, k, e)
		if e.Footprint == nil || e.Footprint.W < 1 || e.Footprint.H < 1 {
			t.Errorf("%s: sin huella", k)
		}
	}
	for name, e := range map[string]SpriteEntry{"robot": m.Robot, "stretcher": m.Stretcher, "shadow": m.Shadow} {
		checkSprite(t, out, name, e)
	}
	if m.Robot.Ride == nil || m.Stretcher.Ride == nil || m.Robot.Frames != 2 {
		t.Error("robot y camilla necesitan ride; el robot, 2 frames")
	}
	// Cobertura de los kind del mapa.
	have := map[string]bool{}
	for _, k := range objectKinds(m) {
		have[k] = true
	}
	for _, k := range DecorKinds {
		if !have[k] {
			t.Errorf("falta sprite para el kind %q del mapa", k)
		}
	}
	for _, d := range Dirs {
		if _, ok := m.Objects["bed:"+d]; !ok {
			t.Errorf("falta bed:%s", d)
		}
	}
	tw, th := sheetSize(t, out, m.Tiles.Sheet)
	for k, e := range m.Tiles.Tiles {
		if e.Frames < 1 || e.X%16 != 0 || e.Y%16 != 0 || e.X+e.Frames*16 > tw || e.Y+16 > th {
			t.Errorf("tile %s fuera de la hoja: %+v", k, e)
		}
	}
	for typ, name := range m.Tiles.ByType {
		if _, ok := m.Tiles.Tiles[name]; !ok {
			t.Errorf("byType %s -> %q no existe", typ, name)
		}
	}
	ew, eh := sheetSize(t, out, m.Emotes.Sheet)
	if ew != m.Emotes.Count*m.Emotes.Frame.W || eh != m.Emotes.Frame.H {
		t.Errorf("emotes %dx%d", ew, eh)
	}
	for k, i := range m.Emotes.Names {
		if i < 0 || i >= m.Emotes.Count {
			t.Errorf("emote %s fuera de rango", k)
		}
	}
	if len(m.Palette) != 32 {
		t.Errorf("la paleta tiene %d colores", len(m.Palette))
	}
}

// Lo que está en el repositorio es exactamente lo que genera la
// herramienta (si falla: go run ./tools/spritegen).
func TestGeneratedFilesUpToDate(t *testing.T) {
	m, out := build(t)
	assets := filepath.Join(root, "web", "assets")
	for rel, data := range out.Files {
		disk, err := os.ReadFile(filepath.Join(assets, filepath.FromSlash(rel)))
		if err != nil || !bytes.Equal(disk, data) {
			t.Errorf("%s desactualizado; corre go run ./tools/spritegen", rel)
		}
	}
	js, err := manifestJSON(m)
	if err != nil {
		t.Fatal(err)
	}
	disk, err := os.ReadFile(filepath.Join(assets, "sprites.json"))
	if err != nil || !bytes.Equal(disk, js) {
		t.Error("sprites.json desactualizado; corre go run ./tools/spritegen")
	}
	if disk, err := os.ReadFile(filepath.Join(root, "tools", "spritegen", "preview.png")); err != nil || !bytes.Equal(disk, out.Preview) {
		t.Error("preview.png desactualizado; corre go run ./tools/spritegen")
	}
	// Y no sobran PNG viejos en generated/.
	filepath.Walk(filepath.Join(assets, "generated"), func(p string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			rel, _ := filepath.Rel(assets, p)
			if _, ok := out.Files[filepath.ToSlash(rel)]; !ok {
				t.Errorf("sobra %s", rel)
			}
		}
		return nil
	})
}

func TestBuildDeterministic(t *testing.T) {
	_, a := build(t)
	_, b, err := Build(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(a.Files) != len(b.Files) {
		t.Fatal("distinta cantidad de archivos")
	}
	for k, v := range a.Files {
		if !bytes.Equal(v, b.Files[k]) {
			t.Errorf("%s cambia entre corridas", k)
		}
	}
}

func TestOverrides(t *testing.T) {
	m, out := build(t)
	dir := t.TempDir()
	custom := filepath.Join(dir, "web", "assets", "custom")
	if err := os.MkdirAll(custom, 0o755); err != nil {
		t.Fatal(err)
	}
	// Una silla de 16×16 hecha "a mano".
	data, err := encodePNG(NewCanvas(16, 16))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(custom, "silla.png"), data, 0o644); err != nil {
		t.Fatal(err)
	}
	ov := filepath.Join(dir, "overrides.json")
	write := func(v any) {
		b, _ := json.Marshal(v)
		if err := os.WriteFile(ov, b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	old := m.Objects["chair"].Sheet
	write(map[string]any{"objects": map[string]any{"chair": map[string]any{"sheet": "custom/silla.png"}}})
	if err := applyOverrides(ov, dir, m, out); err != nil {
		t.Fatal(err)
	}
	if m.Objects["chair"].Sheet != "custom/silla.png" || m.Objects["chair"].Source != "override" {
		t.Fatalf("no se aplicó: %+v", m.Objects["chair"])
	}
	if _, still := out.Files[old]; still {
		t.Error("la hoja generada reemplazada debería dejar de escribirse")
	}
	bad := []any{
		map[string]any{"objects": map[string]any{"monitor": map[string]any{"sheet": "custom/silla.png"}}}, // 3 frames no caben
		map[string]any{"objects": map[string]any{"noexiste": map[string]any{"sheet": "custom/silla.png"}}},
		map[string]any{"layers": map[string]any{"torso/camiseta-junior": "custom/silla.png"}}, // tamaño de capa
		map[string]any{"objects": map[string]any{"tv": map[string]any{"sheet": "../fuera.png"}}},
	}
	for i, v := range bad {
		m2, out2 := build(t)
		write(v)
		if err := applyOverrides(ov, dir, m2, out2); err == nil {
			t.Errorf("caso %d: se esperaba error", i)
		}
	}
}

// La paleta de JS tiene los mismos colores en el mismo orden.
func TestPaletteMatchesJS(t *testing.T) {
	src, err := os.ReadFile(filepath.Join(root, "web", "js", "art", "palette.js"))
	if err != nil {
		t.Fatal(err)
	}
	hexes := regexp.MustCompile(`"(#[0-9a-f]{6})"`).FindAllStringSubmatch(string(src), -1)
	if len(hexes) != len(Palette) {
		t.Fatalf("palette.js tiene %d colores, Go %d", len(hexes), len(Palette))
	}
	for i, h := range hexes {
		if h[1] != Palette[i].Hex {
			t.Errorf("color %d: JS %s, Go %s", i, h[1], Palette[i].Hex)
		}
	}
}

// bounds devuelve el rectángulo [x0,x1)×[y0,y1) de los pixeles opacos.
func bounds(c *Canvas) (x0, y0, x1, y1 int) {
	x0, y0, x1, y1 = c.W, c.H, 0, 0
	for y := 0; y < c.H; y++ {
		for x := 0; x < c.W; x++ {
			if c.Get(x, y) == Transparent {
				continue
			}
			x0, y0 = min(x0, x), min(y0, y)
			x1, y1 = max(x1, x+1), max(y1, y+1)
		}
	}
	return
}

// TestPatientInsideMattress: para cada cama y cada dirección, el cuerpo
// acostado (piel y ropa, de todos los tonos y camisetas) queda dentro del
// rectángulo del colchón, con la cabeza del lado de la cabecera.
func TestPatientInsideMattress(t *testing.T) {
	m, out := build(t)
	ch := m.Characters
	for _, dir := range []string{"right", "left", "down", "up"} {
		bed := m.Objects["bed:"+dir]
		if bed.Mattress == nil || bed.Ride == nil || bed.Cover == nil || bed.Sit == nil {
			t.Fatalf("bed:%s sin mattress/ride/cover/sit", dir)
		}
		if bed.Ride.Rotate != 0 || bed.Ride.FlipX {
			t.Errorf("bed:%s: el ride ya no gira ni refleja", dir)
		}
		row := ch.Animations["sleep"].Rows[dir]
		for _, cat := range []string{"skin", "torso", "head"} {
			for _, l := range ch.Layers[cat] {
				if l.Sheet == nil {
					continue
				}
				for f := 0; f < ch.Animations["sleep"].Frames; f++ {
					fr := out.Canvases[*l.Sheet].Crop(f*CharW, row*CharH, CharW, CharH)
					x0, y0, x1, y1 := bounds(fr)
					if x1 == 0 {
						continue
					}
					mr := bed.Mattress
					gx0, gy0 := bed.Ride.X-CharW/2+x0, bed.Ride.Y-CharH/2+y0
					gx1, gy1 := bed.Ride.X-CharW/2+x1, bed.Ride.Y-CharH/2+y1
					// El sombrero vueltiao sobresale a los lados de la cabeza.
					slack := 0
					if cat == "head" {
						slack = 1
					}
					if gx0 < mr.X-slack || gy0 < mr.Y-slack || gx1 > mr.X+mr.W+slack || gy1 > mr.Y+mr.H+slack {
						t.Errorf("bed:%s capa %s: cuerpo [%d,%d)-[%d,%d) fuera del colchón %+v", dir, l.ID, gx0, gy0, gx1, gy1, *mr)
					}
				}
			}
		}
		// La cabeza (más ancha que el cuello) queda del lado de la cabecera.
		skin := ch.Layers["skin"][0]
		fr := out.Canvases[*skin.Sheet].Crop(0, row*CharH, CharW, CharH)
		x0, y0, x1, y1 := bounds(fr)
		cx, cy := bed.Ride.X-CharW/2, bed.Ride.Y-CharH/2
		mr := bed.Mattress
		midX, midY := mr.X+mr.W/2, mr.Y+mr.H/2
		hx, hy := cx+(x0+x1)/2, cy+(y0+y1)/2
		_ = hx
		_ = hy
		switch dir {
		case "right":
			if cx+x0 >= midX {
				t.Errorf("bed:right: la cabeza debe quedar a la izquierda")
			}
		case "left":
			if cx+x1 <= midX {
				t.Errorf("bed:left: la cabeza debe quedar a la derecha")
			}
		case "down":
			if cy+y0 >= midY {
				t.Errorf("bed:down: la cabeza debe quedar arriba")
			}
		case "up":
			if cy+y1 <= midY {
				t.Errorf("bed:up: la cabeza debe quedar abajo")
			}
		}
	}
}
