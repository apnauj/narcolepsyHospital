package main

import (
	"fmt"
	"sort"
)

// Vista previa: una hoja de contacto ampliada ×4 para revisión humana. No
// la usa el código del frontend.
const previewScale = 4

// stackLayers apila las hojas de capa de una apariencia (por ID de capa).
func stackLayers(m *Manifest, out *Output, ids map[string]string) (*Canvas, error) {
	var sheet *Canvas
	for _, cat := range m.Characters.LayerOrder {
		id := ids[cat]
		var entry *LayerEntry
		for i := range m.Characters.Layers[cat] {
			if m.Characters.Layers[cat][i].ID == id {
				entry = &m.Characters.Layers[cat][i]
			}
		}
		if entry == nil {
			return nil, fmt.Errorf("vista previa: capa %s %q no existe", cat, id)
		}
		if entry.Sheet == nil {
			continue
		}
		c := out.Canvases[*entry.Sheet]
		if c == nil {
			return nil, fmt.Errorf("vista previa: falta la hoja %s", *entry.Sheet)
		}
		if sheet == nil {
			sheet = NewCanvas(c.W, c.H)
		}
		sheet.Blit(c, 0, 0)
	}
	return sheet, nil
}

// previewBlock es un rectángulo que se pega en la hoja de contacto.
type previewBlock struct {
	c *Canvas
}

// buildPreview arma la hoja: personajes completos (todas las filas), luego
// cada capa sola sobre la base, objetos, tiles y emotes.
func buildPreview(grids map[string]*Grid, m *Manifest, out *Output) (*Canvas, error) {
	var people []map[string]string
	kinds := make([]string, 0, len(m.Characters.Staff))
	for k := range m.Characters.Staff {
		kinds = append(kinds, k)
	}
	sort.Strings(kinds)
	for _, k := range kinds {
		for _, p := range m.Characters.Staff[k] {
			people = append(people, map[string]string{"skin": p.Skin, "torso": p.Torso, "head": p.Head, "accessory": p.Accessory})
		}
	}
	// Muestra de pacientes: recorre los pools en diagonal para ver todo.
	pools := m.Characters.Patients
	for i := 0; i < 12; i++ {
		people = append(people, map[string]string{
			"skin":      pools["skin"][i%len(pools["skin"])],
			"torso":     pools["torso"][i%len(pools["torso"])],
			"head":      pools["head"][(i*3+1)%len(pools["head"])],
			"accessory": pools["accessory"][(i*2+3)%len(pools["accessory"])],
		})
	}
	var rows [][]*Canvas
	var row []*Canvas
	for i, p := range people {
		s, err := stackLayers(m, out, p)
		if err != nil {
			return nil, err
		}
		row = append(row, s)
		if (i+1)%11 == 0 {
			rows = append(rows, row)
			row = nil
		}
	}
	if row != nil {
		rows = append(rows, row)
	}
	// Camiseta de la Selección: frames clave en 3 pieles y distintas poses.
	var sel []*Canvas
	for i, skin := range []string{"piel-1", "piel-3", "piel-4"} {
		st, err := stackLayers(m, out, map[string]string{"skin": skin, "torso": "seleccion", "head": []string{"pelo-corto-negro", "pelo-crespo-cafe", "vueltiao"}[i], "accessory": "ninguno"})
		if err != nil {
			return nil, err
		}
		an := m.Characters.Animations
		for _, f := range []struct {
			anim, dir string
			frame     int
		}{{"idle", "down", 0}, {"idle", "up", 0}, {"idle", "left", 0}, {"walk", "right", 1}, {"attend", "down", 1}, {"push", "left", 1}} {
			sel = append(sel, st.Crop(f.frame*CharW, an[f.anim].Rows[f.dir]*CharH, CharW, CharH))
		}
	}
	rows = append(rows, sel)
	// Pacientes acostados en cama, camilla y robot (prueba de "ride").
	rider, err := stackLayers(m, out, people[len(people)-12])
	if err != nil {
		return nil, err
	}
	var rides []*Canvas
	lyingFor := func(dir string) *Canvas {
		sr := m.Characters.Animations["stretcher"].Rows[dir]
		return rider.Crop(0, sr*CharH, CharW, CharH)
	}
	for _, d := range []string{"right", "left", "down", "up"} {
		rides = append(rides, withRider(out, m.Objects["bed:"+d], lyingFor(d)))
	}
	rides = append(rides, withRider(out, m.Stretcher, lyingFor("right")), withRider(out, m.Robot, lyingFor("right")))
	// Despertando en cama (sentado), una cama por dirección.
	wr := m.Characters.Animations["wake"].Rows["down"]
	for _, d := range []string{"right", "left", "down", "up"} {
		rides = append(rides, withSitter(out, m.Objects["bed:"+d], rider.Crop(CharW, wr*CharH, CharW, CharH)))
	}
	rows = append(rows, rides)
	// Objetos, tiles y emotes.
	rows = append(rows, previewExtras(m, out)...)

	const gap = 4
	w, h := 0, 0
	for _, r := range rows {
		rw, rh := 0, 0
		for _, c := range r {
			rw += c.W + gap
			if c.H > rh {
				rh = c.H
			}
		}
		if rw > w {
			w = rw
		}
		h += rh + gap
	}
	sheet := NewCanvas(w+gap, h+gap)
	// Fondo menta (el piso de la clínica) para ver la transparencia.
	for i := range sheet.Pix {
		sheet.Pix[i] = byName("menta")
	}
	y := gap
	for _, r := range rows {
		x, rh := gap, 0
		for _, c := range r {
			sheet.Blit(c, x, y)
			x += c.W + gap
			if c.H > rh {
				rh = c.H
			}
		}
		y += rh + gap
	}
	return scale(sheet, previewScale), nil
}

// previewExtras agrupa objetos, tiles y emotes en filas.
func previewExtras(m *Manifest, out *Output) [][]*Canvas {
	var rows [][]*Canvas
	// Comida sobre la mesa, como la dibuja el painter (la mesa y encima la comida).
	var food []*Canvas
	if tb, ok := m.Objects["table"]; ok {
		for _, k := range []string{"salchipapas", "cervezaAguila", "arrozCoco"} {
			f, ok := m.Objects[k]
			if !ok {
				continue
			}
			c := NewCanvas(16, 16)
			c.Blit(out.Canvases[tb.Sheet].Crop(tb.X, tb.Y, 16, 16), 0, 0)
			c.Blit(out.Canvases[f.Sheet].Crop(f.X, f.Y, f.Frame.W, f.Frame.H), 0, 0)
			food = append(food, c)
		}
		rows = append(rows, food)
	}
	var objs []*Canvas
	names := make([]string, 0, len(m.Objects))
	for k := range m.Objects {
		names = append(names, k)
	}
	sort.Strings(names)
	add := func(e SpriteEntry) {
		c := out.Canvases[e.Sheet]
		if c == nil {
			return
		}
		objs = append(objs, c.Crop(e.X, e.Y, e.Frame.W*e.Frames, e.Frame.H))
	}
	for _, e := range []SpriteEntry{m.Robot, m.Stretcher, m.Shadow} {
		if e.Sheet != "" {
			add(e)
		}
	}
	for _, k := range names {
		add(m.Objects[k])
	}
	width := 0
	var row []*Canvas
	for _, c := range objs {
		if width+c.W > 400 && row != nil {
			rows = append(rows, row)
			row, width = nil, 0
		}
		row = append(row, c)
		width += c.W + 4
	}
	if row != nil {
		rows = append(rows, row)
	}
	if c := out.Canvases[m.Tiles.Sheet]; c != nil {
		rows = append(rows, []*Canvas{c})
	}
	if c := out.Canvases[m.Emotes.Sheet]; c != nil {
		rows = append(rows, []*Canvas{c})
	}
	return rows
}

// withRider dibuja el primer frame de un objeto con el paciente acostado
// encima (el frame de la fila de la dirección de la cama, sin girar
// nada), aplicando Ride igual que lo haría el renderer, y repinta encima el
// rectángulo Cover (la manta).
func withRider(out *Output, e SpriteEntry, lying *Canvas) *Canvas {
	obj := out.Canvases[e.Sheet].Crop(e.X, e.Y, e.Frame.W, e.Frame.H)
	const pad = 10
	c := NewCanvas(obj.W+2*pad, obj.H+2*pad)
	c.Blit(obj, pad, pad)
	if e.Ride == nil {
		return c
	}
	c.Blit(lying, pad+e.Ride.X-lying.W/2, pad+e.Ride.Y-lying.H/2)
	coverOver(c, obj, e, pad)
	return c
}

// withSitter dibuja al paciente sentado (wake) sobre una cama.
func withSitter(out *Output, e SpriteEntry, sit *Canvas) *Canvas {
	obj := out.Canvases[e.Sheet].Crop(e.X, e.Y, e.Frame.W, e.Frame.H)
	const pad = 10
	c := NewCanvas(obj.W+2*pad, obj.H+2*pad)
	c.Blit(obj, pad, pad)
	if e.Sit != nil {
		c.Blit(sit, pad+e.Sit.X-sit.W/2, pad+e.Sit.Y-sit.H/2)
		coverOver(c, obj, e, pad)
	}
	return c
}

// coverOver repinta la manta de la cama sobre el paciente.
func coverOver(c, obj *Canvas, e SpriteEntry, pad int) {
	if e.Cover == nil {
		return
	}
	c.Blit(obj.Crop(e.Cover.X, e.Cover.Y, e.Cover.W, e.Cover.H), pad+e.Cover.X, pad+e.Cover.Y)
}

// scale amplía con vecino más cercano.
func scale(c *Canvas, k int) *Canvas {
	out := NewCanvas(c.W*k, c.H*k)
	for y := 0; y < out.H; y++ {
		for x := 0; x < out.W; x++ {
			out.Pix[y*out.W+x] = c.Pix[(y/k)*c.W+x/k]
		}
	}
	return out
}
