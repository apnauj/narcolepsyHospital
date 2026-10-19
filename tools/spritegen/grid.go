package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Grid es un dibujo de texto: cada celda es un carácter de grilla.
//   - '.'          transparente
//   - '0'-'9','a'-'v'  color literal de la paleta (base 32)
//   - 'A'-'Z'      ranura (slot): su color lo decide quien dibuja la grilla
//     con un SlotMap; así se hace el cambio de paleta.
type Grid struct {
	Name string
	W, H int
	Rows []string
}

// At devuelve el carácter en (x, y).
func (g *Grid) At(x, y int) rune { return rune(g.Rows[y][x]) }

// SlotMap dice de qué color se pinta cada ranura. Una ranura ausente del
// mapa no se pinta. El valor Transparent borra el pixel (sirve para "no
// pintar" explícito).
type SlotMap map[rune]int

// ParseGrids lee un archivo de grillas. Formato:
//
//	# comentario
//	@nombre 16x20
//	................   (H filas de W caracteres)
//
// Las líneas en blanco y los comentarios fuera de un bloque se ignoran. Un
// bloque termina cuando se leyeron H filas.
func ParseGrids(r io.Reader, file string) (map[string]*Grid, error) {
	out := map[string]*Grid{}
	sc := bufio.NewScanner(r)
	line := 0
	var cur *Grid
	for sc.Scan() {
		line++
		text := strings.TrimRight(sc.Text(), " \t\r")
		if cur != nil {
			if len(text) != cur.W {
				return nil, fmt.Errorf("%s:%d: la fila de %q mide %d, se esperaba %d", file, line, cur.Name, len(text), cur.W)
			}
			for i, c := range text {
				if !validCell(c) {
					return nil, fmt.Errorf("%s:%d:%d: carácter inválido %q en %q", file, line, i+1, c, cur.Name)
				}
			}
			cur.Rows = append(cur.Rows, text)
			if len(cur.Rows) == cur.H {
				out[cur.Name] = cur
				cur = nil
			}
			continue
		}
		if text == "" || strings.HasPrefix(text, "#") {
			continue
		}
		if !strings.HasPrefix(text, "@") {
			return nil, fmt.Errorf("%s:%d: se esperaba un encabezado @nombre WxH", file, line)
		}
		var name string
		var w, h int
		if _, err := fmt.Sscanf(text, "@%s %dx%d", &name, &w, &h); err != nil || w <= 0 || h <= 0 {
			return nil, fmt.Errorf("%s:%d: encabezado inválido %q", file, line, text)
		}
		if _, dup := out[name]; dup {
			return nil, fmt.Errorf("%s:%d: grilla repetida %q", file, line, name)
		}
		cur = &Grid{Name: name, W: w, H: h}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if cur != nil {
		return nil, fmt.Errorf("%s: la grilla %q quedó incompleta (%d de %d filas)", file, cur.Name, len(cur.Rows), cur.H)
	}
	return out, nil
}

func validCell(c rune) bool {
	return c == '.' || paletteIndex(c) >= 0 || (c >= 'A' && c <= 'Z')
}

// LoadGridDir lee todos los src/*.txt y junta sus grillas. Un nombre
// repetido entre archivos es un error.
func LoadGridDir(dir string) (map[string]*Grid, error) {
	files, err := filepath.Glob(filepath.Join(dir, "*.txt"))
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	all := map[string]*Grid{}
	for _, f := range files {
		fh, err := os.Open(f)
		if err != nil {
			return nil, err
		}
		gs, err := ParseGrids(fh, filepath.Base(f))
		fh.Close()
		if err != nil {
			return nil, err
		}
		for k, g := range gs {
			if _, dup := all[k]; dup {
				return nil, fmt.Errorf("%s: grilla %q repetida en otro archivo", filepath.Base(f), k)
			}
			all[k] = g
		}
	}
	return all, nil
}

// Canvas es un lienzo de índices de paleta (Transparent = sin pixel).
type Canvas struct {
	W, H int
	Pix  []int
}

// NewCanvas crea un lienzo transparente.
func NewCanvas(w, h int) *Canvas {
	c := &Canvas{W: w, H: h, Pix: make([]int, w*h)}
	for i := range c.Pix {
		c.Pix[i] = Transparent
	}
	return c
}

// Get devuelve el índice en (x, y), o Transparent fuera del lienzo.
func (c *Canvas) Get(x, y int) int {
	if x < 0 || y < 0 || x >= c.W || y >= c.H {
		return Transparent
	}
	return c.Pix[y*c.W+x]
}

// Set pinta (x, y) si está dentro del lienzo.
func (c *Canvas) Set(x, y, v int) {
	if x < 0 || y < 0 || x >= c.W || y >= c.H {
		return
	}
	c.Pix[y*c.W+x] = v
}

// Empty dice si el lienzo no tiene ningún pixel.
func (c *Canvas) Empty() bool {
	for _, v := range c.Pix {
		if v != Transparent {
			return false
		}
	}
	return true
}

// DrawGrid pinta g en (dx, dy). Los literales se pintan solo si literals es
// true; las ranuras según slots.
func (c *Canvas) DrawGrid(g *Grid, dx, dy int, slots SlotMap, literals bool) {
	for y := 0; y < g.H; y++ {
		for x := 0; x < g.W; x++ {
			ch := g.At(x, y)
			if ch == '.' {
				continue
			}
			if p := paletteIndex(ch); p >= 0 {
				if literals {
					c.Set(x+dx, y+dy, p)
				}
				continue
			}
			if v, ok := slots[ch]; ok {
				c.Set(x+dx, y+dy, v)
			}
		}
	}
}

// Blit copia los pixeles no transparentes de src en (dx, dy).
func (c *Canvas) Blit(src *Canvas, dx, dy int) {
	for y := 0; y < src.H; y++ {
		for x := 0; x < src.W; x++ {
			if v := src.Pix[y*src.W+x]; v != Transparent {
				c.Set(x+dx, y+dy, v)
			}
		}
	}
}

// Shift devuelve una copia desplazada (lo que sale del borde se pierde).
func (c *Canvas) Shift(dx, dy int) *Canvas {
	out := NewCanvas(c.W, c.H)
	out.Blit(c, dx, dy)
	return out
}

// Mirror devuelve el reflejo horizontal.
func (c *Canvas) Mirror() *Canvas {
	out := NewCanvas(c.W, c.H)
	for y := 0; y < c.H; y++ {
		for x := 0; x < c.W; x++ {
			out.Pix[y*c.W+(c.W-1-x)] = c.Pix[y*c.W+x]
		}
	}
	return out
}

// RotateCCW gira 90° en sentido antihorario: lo que estaba arriba queda a
// la izquierda. El resultado mide H×W.
func (c *Canvas) RotateCCW() *Canvas {
	out := NewCanvas(c.H, c.W)
	for y := 0; y < c.H; y++ {
		for x := 0; x < c.W; x++ {
			out.Set(y, c.W-1-x, c.Pix[y*c.W+x])
		}
	}
	return out
}

// Crop devuelve el rectángulo (x, y, w, h).
func (c *Canvas) Crop(x0, y0, w, h int) *Canvas {
	out := NewCanvas(w, h)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			out.Pix[y*w+x] = c.Get(x0+x, y0+y)
		}
	}
	return out
}

// Remap cambia los índices de paleta según m (cambio de paleta sobre un
// lienzo ya pintado). Los índices ausentes quedan igual.
func (c *Canvas) Remap(m map[int]int) *Canvas {
	out := NewCanvas(c.W, c.H)
	for i, v := range c.Pix {
		if n, ok := m[v]; ok {
			out.Pix[i] = n
		} else {
			out.Pix[i] = v
		}
	}
	return out
}

// GridCanvas pinta una grilla sola, con literales, en un lienzo de su
// tamaño.
func GridCanvas(g *Grid, slots SlotMap) *Canvas {
	c := NewCanvas(g.W, g.H)
	c.DrawGrid(g, 0, 0, slots, true)
	return c
}

// FlipV devuelve el reflejo vertical.
func (c *Canvas) FlipV() *Canvas {
	out := NewCanvas(c.W, c.H)
	for y := 0; y < c.H; y++ {
		copy(out.Pix[(c.H-1-y)*c.W:(c.H-y)*c.W], c.Pix[y*c.W:(y+1)*c.W])
	}
	return out
}

// RotateCW gira 90° en sentido horario.
func (c *Canvas) RotateCW() *Canvas {
	return c.RotateCCW().RotateCCW().RotateCCW()
}

// Rotate180 gira 180°.
func (c *Canvas) Rotate180() *Canvas {
	return c.RotateCCW().RotateCCW()
}
