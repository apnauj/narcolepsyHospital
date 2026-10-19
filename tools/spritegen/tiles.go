package main

import "fmt"

// tileDef es un tile de la hoja: nombre y grillas (una por frame).
type tileDef struct {
	Name   string
	Frames []string
	FPS    float64
}

// tileDefs en el orden de la hoja (8 columnas).
var tileDefs = []tileDef{
	{"piso", []string{"tile_piso"}, 0},
	{"piso-menta", []string{"tile_piso_menta"}, 0},
	{"madera", []string{"tile_madera"}, 0},
	{"pared", []string{"tile_pared"}, 0},
	{"pared-tope", []string{"tile_pared_tope"}, 0},
	{"ventana", []string{"tile_ventana"}, 0},
	{"puerta", []string{"tile_puerta"}, 0},
	{"puerta-abierta", []string{"tile_puerta_abierta"}, 0},
	{"arena", []string{"tile_arena"}, 0},
	{"grama", []string{"tile_grama"}, 0},
	{"jardin", []string{"tile_jardin"}, 0},
	{"seto", []string{"tile_seto"}, 0},
	{"tapete", []string{"tile_tapete"}, 0},
	{"vacio", []string{"tile_vacio"}, 0},
	{"mar", []string{"tile_mar_0", "tile_mar_1"}, 1},
	{"playa", []string{"tile_playa"}, 0},
	{"playa-orilla", []string{"tile_playa_orilla"}, 0},
	{"mar-orilla", []string{"tile_mar_orilla_0", "tile_mar_orilla_1"}, 1},
}

// TileByType: qué tile usar para cada valor de TILE de
// web/js/world/tiles.js. Para WALL, el painter usa "pared" si el tile de
// abajo no es muro (se ve la cara) y "pared-tope" si lo es. FURNITURE y BED
// pintan el piso que traiga la decoración en "under" (si no, este).
var TileByType = map[string]string{
	"VOID":       "jardin",
	"FLOOR":      "piso",
	"WALL":       "pared",
	"DOOR":       "puerta-abierta",
	"BED":        "piso-menta",
	"WINDOW":     "ventana",
	"FURNITURE":  "piso",
	"COUNTER":    "mostrador",
	"GRASS":      "grama",
	"PATH":       "arena",
	"HEDGE":      "seto",
	"ROOM_FLOOR": "piso-menta",
	"WOOD":       "madera",
	// v2: el painter usa "mar-orilla" si el tile de abajo no es mar y
	// "playa-orilla" si el de arriba es mar.
	"SAND": "playa",
	"SEA":  "mar",
}

const tileCols = 8

// buildTiles arma generated/tiles.png. El mostrador sale del objeto
// "counter" (Kenney) para que piso y mueble sean el mismo dibujo.
func buildTiles(grids map[string]*Grid, m *Manifest, out *Output) error {
	type cell struct {
		name   string
		frames []*Canvas
		fps    float64
		source string
	}
	var cells []cell
	for _, t := range tileDefs {
		var fs []*Canvas
		for _, g := range t.Frames {
			gr := grids[g]
			if gr == nil {
				return fmt.Errorf("tile %s: falta la grilla %q", t.Name, g)
			}
			if gr.W != 16 || gr.H != 16 {
				return fmt.Errorf("tile %s: %q mide %dx%d", t.Name, g, gr.W, gr.H)
			}
			fs = append(fs, GridCanvas(gr, nil))
		}
		cells = append(cells, cell{t.Name, fs, t.FPS, "propio"})
	}
	if c, ok := m.Objects["counter"]; ok {
		cells = append(cells, cell{"mostrador", []*Canvas{out.Canvases[c.Sheet].Crop(0, 0, 16, 16)}, 0, c.Source})
	}
	// Ubicación: de izquierda a derecha; un tile animado no se parte entre
	// filas.
	type pos struct{ x, y int }
	place := map[string]pos{}
	col, row := 0, 0
	for _, c := range cells {
		if col+len(c.frames) > tileCols {
			col, row = 0, row+1
		}
		place[c.name] = pos{col, row}
		col += len(c.frames)
	}
	sheet := NewCanvas(tileCols*16, (row+1)*16)
	tm := TileManifest{Sheet: "generated/tiles.png", Size: 16, Tiles: map[string]TileEntry{}, ByType: TileByType}
	for _, c := range cells {
		p := place[c.name]
		for i, f := range c.frames {
			sheet.Blit(f, (p.x+i)*16, p.y*16)
		}
		tm.Tiles[c.name] = TileEntry{X: p.x * 16, Y: p.y * 16, Frames: len(c.frames), FPS: c.fps, Source: c.source}
	}
	for typ, name := range TileByType {
		if _, ok := tm.Tiles[name]; !ok {
			return fmt.Errorf("TILE.%s apunta a %q, que no existe", typ, name)
		}
	}
	m.Tiles = tm
	return out.PNG(tm.Sheet, sheet)
}
