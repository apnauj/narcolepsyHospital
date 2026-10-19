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
	// Pacientes acostados en cama, camilla y robot (prueba de "ride").
	rider, err := stackLayers(m, out, people[len(people)-12])
	if err != nil {
		return nil, err
	}
	sr := m.Characters.Animations["stretcher"].Rows["down"]
	lying := rider.Crop(0, sr*CharH, CharW, CharH)
	var rides []*Canvas
	for _, k := range []string{"bed:right", "bed:left", "bed:down", "bed:up"} {
		rides = append(rides, withRider(out, m.Objects[k], lying))
	}
	rides = append(rides, withRider(out, m.Stretcher, lying), withRider(out, m.Robot, lying))
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
// encima, aplicando Ride igual que lo haría el renderer.
func withRider(out *Output, e SpriteEntry, lying *Canvas) *Canvas {
	obj := out.Canvases[e.Sheet].Crop(e.X, e.Y, e.Frame.W, e.Frame.H)
	const pad = 10
	c := NewCanvas(obj.W+2*pad, obj.H+2*pad)
	c.Blit(obj, pad, pad)
	if e.Ride == nil {
		return c
	}
	r := lying
	if e.Ride.FlipX {
		r = r.Mirror()
	}
	for a := 0; a < e.Ride.Rotate; a += 90 {
		r = r.RotateCW()
	}
	c.Blit(r, pad+e.Ride.X-r.W/2, pad+e.Ride.Y-r.H/2)
	return c
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
