package main

import (
	"fmt"
	"strings"
)

// Fuente de 3×5 para los letreros pintados en el arte (solo mayúsculas,
// dígitos y las tildes que se usan). Las tildes ocupan una fila extra arriba
// (fila -1), por eso cada línea de texto reserva 6 filas.
var font3x5 = map[rune][5]string{
	'A': {".#.", "#.#", "###", "#.#", "#.#"},
	'B': {"##.", "#.#", "##.", "#.#", "##."},
	'C': {".##", "#..", "#..", "#..", ".##"},
	'D': {"##.", "#.#", "#.#", "#.#", "##."},
	'E': {"###", "#..", "##.", "#..", "###"},
	'F': {"###", "#..", "##.", "#..", "#.."},
	'G': {".##", "#..", "#.#", "#.#", ".##"},
	'H': {"#.#", "#.#", "###", "#.#", "#.#"},
	'I': {"###", ".#.", ".#.", ".#.", "###"},
	'J': {"..#", "..#", "..#", "#.#", ".#."},
	'K': {"#.#", "#.#", "##.", "#.#", "#.#"},
	'L': {"#..", "#..", "#..", "#..", "###"},
	'M': {"#.#", "###", "###", "#.#", "#.#"},
	'N': {"##.", "#.#", "#.#", "#.#", "#.#"},
	'O': {".#.", "#.#", "#.#", "#.#", ".#."},
	'P': {"##.", "#.#", "##.", "#..", "#.."},
	'Q': {".#.", "#.#", "#.#", "##.", ".##"},
	'R': {"##.", "#.#", "##.", "#.#", "#.#"},
	'S': {".##", "#..", ".#.", "..#", "##."},
	'T': {"###", ".#.", ".#.", ".#.", ".#."},
	'U': {"#.#", "#.#", "#.#", "#.#", "###"},
	'V': {"#.#", "#.#", "#.#", "#.#", ".#."},
	'W': {"#.#", "#.#", "###", "###", "#.#"},
	'X': {"#.#", "#.#", ".#.", "#.#", "#.#"},
	'Y': {"#.#", "#.#", ".#.", ".#.", ".#."},
	'Z': {"###", "..#", ".#.", "#..", "###"},
	'0': {"###", "#.#", "#.#", "#.#", "###"},
	'1': {".#.", "##.", ".#.", ".#.", "###"},
	' ': {"...", "...", "...", "...", "..."},
	'.': {"...", "...", "...", "...", ".#."},
	'!': {".#.", ".#.", ".#.", "...", ".#."},
}

// accents: letra con tilde -> letra base y marca encima (fila -1).
var accents = map[rune]struct {
	base rune
	mark string
}{
	'Á': {'A', "..#"}, 'É': {'E', "..#"}, 'Í': {'I', "..#"}, 'Ó': {'O', "..#"}, 'Ú': {'U', "..#"},
	'Ñ': {'N', "###"},
}

// textWidth mide una línea en pixeles (3 por letra y 1 de separación).
func textWidth(s string) int {
	n := len([]rune(s))
	if n == 0 {
		return 0
	}
	return n*4 - 1
}

// drawText pinta s con su esquina superior izquierda (de la fila de
// mayúsculas, sin contar la tilde) en (x, y).
func drawText(c *Canvas, s string, x, y, color int) error {
	for _, r := range strings.ToUpper(s) {
		mark := ""
		if a, ok := accents[r]; ok {
			r, mark = a.base, a.mark
		}
		g, ok := font3x5[r]
		if !ok {
			return fmt.Errorf("la fuente 3x5 no tiene %q", r)
		}
		for i, ch := range mark {
			if ch == '#' {
				c.Set(x+i, y-1, color)
			}
		}
		for gy, row := range g {
			for gx, ch := range row {
				if ch == '#' {
					c.Set(x+gx, y+gy, color)
				}
			}
		}
		x += 4
	}
	return nil
}
