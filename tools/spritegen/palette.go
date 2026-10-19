package main

import (
	"fmt"
	"image/color"
)

// Entry es un color de la paleta Caribe con su nombre y el carácter que lo
// representa en las grillas de texto (src/*.txt).
type Entry struct {
	Char rune
	Name string
	Hex  string
}

// Palette es la paleta Caribe compartida con web/js/art/palette.js. El orden
// es parte del contrato: el índice i del array es el índice i en JS, y el
// carácter de grilla es el dígito i en base 32 (0-9, a-v).
var Palette = [32]Entry{
	{'0', "tinta", "#2b2118"},
	{'1', "sombra-azul", "#3b4a6b"},
	{'2', "gris", "#8b97a8"},
	{'3', "gris-claro", "#c7d0d9"},
	{'4', "blanco-calido", "#fdf6e3"},
	{'5', "blanco", "#ffffff"},
	{'6', "menta", "#8fd8c4"},
	{'7', "menta-oscuro", "#4fa48e"},
	{'8', "sol", "#f7c948"},
	{'9', "naranja", "#ee8b3a"},
	{'a', "rojo-junior", "#d62839"},
	{'b', "rojo-oscuro", "#8e1b2c"},
	{'c', "azul-mar", "#2f80c2"},
	{'d', "celeste", "#7cc6f0"},
	{'e', "azul-noche", "#1d2b3a"},
	{'f', "madera-clara", "#dcae74"},
	{'g', "madera-oscura", "#9a6339"},
	{'h', "verde-tropical", "#5bb04a"},
	{'i', "verde-oscuro", "#2e7546"},
	{'j', "verde-lima", "#b4dc5a"},
	{'k', "piel-1", "#f8d5b4"},
	{'l', "piel-1-sombra", "#e2ab86"},
	{'m', "piel-2", "#dca274"},
	{'n', "piel-2-sombra", "#b97a50"},
	{'o', "piel-3", "#a8683f"},
	{'p', "piel-3-sombra", "#84492a"},
	{'q', "piel-4", "#6e4128"},
	{'r', "piel-4-sombra", "#4c2a19"},
	{'s', "rosado", "#f39ab5"},
	{'t', "morado", "#8a5cc2"},
	{'u', "arena", "#ecdcab"},
	{'v', "cafe-pelo", "#5a3a22"},
}

// Transparent es el índice que usan los lienzos para "sin pixel".
const Transparent = -1

// paletteIndex devuelve el índice del carácter de grilla, o -1 si no es un
// color de la paleta.
func paletteIndex(c rune) int {
	switch {
	case c >= '0' && c <= '9':
		return int(c - '0')
	case c >= 'a' && c <= 'v':
		return int(c-'a') + 10
	}
	return -1
}

// rgba convierte el hex de una entrada a color.RGBA opaco.
func (e Entry) rgba() color.RGBA {
	var r, g, b uint8
	if _, err := fmt.Sscanf(e.Hex, "#%02x%02x%02x", &r, &g, &b); err != nil {
		panic("paleta inválida: " + e.Hex)
	}
	return color.RGBA{r, g, b, 255}
}

// colorPalette es la paleta de los PNG generados: el índice 0 es
// transparente y el color i de la paleta Caribe va en el índice i+1.
func colorPalette() color.Palette {
	p := make(color.Palette, 0, len(Palette)+1)
	p = append(p, color.RGBA{})
	for _, e := range Palette {
		p = append(p, e.rgba())
	}
	return p
}

// byName busca un índice por nombre; entra en pánico si no existe, porque
// solo se usa con nombres fijos del código.
func byName(name string) int {
	for i, e := range Palette {
		if e.Name == name {
			return i
		}
	}
	panic("color desconocido: " + name)
}

// nearest devuelve el índice de la paleta más parecido a c (distancia
// euclidiana ponderada por la sensibilidad del ojo). Sirve para recolorear
// los sprites de otros packs a la paleta Caribe.
func nearest(c color.Color) int {
	r, g, b, _ := c.RGBA()
	best, bestD := 0, int64(-1)
	for i, e := range Palette {
		p := e.rgba()
		dr := int64(r>>8) - int64(p.R)
		dg := int64(g>>8) - int64(p.G)
		db := int64(b>>8) - int64(p.B)
		d := 3*dr*dr + 4*dg*dg + 2*db*db
		if bestD < 0 || d < bestD {
			best, bestD = i, d
		}
	}
	return best
}
