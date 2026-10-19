package main

import "math"

// canchaFrame dibuja la cancha de fútbol vista desde arriba, de 8×5 tiles
// (128×80): pasto rayado, líneas blancas, círculo central, áreas y un arco
// (portería con red) en cada extremo.
func canchaFrame() *Canvas {
	const w, h = 128, 80
	c := NewCanvas(w, h)
	// Pasto rayado en franjas verticales de 8 px.
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			col := n("verde-tropical")
			if (x/8)%2 == 1 {
				col = n("verde-lima")
			}
			c.Set(x, y, col)
		}
	}
	white := n("blanco")
	// Marco del campo: 4 px de margen (ahí van los arcos).
	const x0, y0, x1, y1 = 5, 4, 122, 75
	rect := func(ax, ay, bx, by int) {
		for x := ax; x <= bx; x++ {
			c.Set(x, ay, white)
			c.Set(x, by, white)
		}
		for y := ay; y <= by; y++ {
			c.Set(ax, y, white)
			c.Set(bx, y, white)
		}
	}
	rect(x0, y0, x1, y1)
	// Línea de medio campo y círculo central.
	mx, my := (x0+x1)/2, (y0+y1)/2
	for y := y0; y <= y1; y++ {
		c.Set(mx, y, white)
	}
	for a := 0.0; a < 2*math.Pi; a += 0.02 {
		c.Set(mx+int(math.Round(10*math.Cos(a))), my+int(math.Round(10*math.Sin(a))), white)
	}
	for _, d := range [][2]int{{0, 0}, {1, 0}, {0, 1}, {1, 1}} {
		c.Set(mx+d[0], my+d[1], white)
	}
	// Áreas grandes y chicas y punto penal, en ambos extremos. `in` es el
	// sentido hacia el centro de la cancha.
	for _, side := range []int{-1, 1} {
		edge, in := x0, 1
		if side == 1 {
			edge, in = x1, -1
		}
		bigTo := edge + in*22
		smallTo := edge + in*10
		rect(minInt(edge, bigTo), my-20, maxInt(edge, bigTo), my+20)
		rect(minInt(edge, smallTo), my-10, maxInt(edge, smallTo), my+10)
		c.Set(edge+in*15, my, white)
		// Media luna del área grande, hacia el centro.
		for a := -math.Pi / 2; a <= math.Pi/2; a += 0.03 {
			px := bigTo + in*int(math.Round(5*math.Cos(a)))
			py := my + int(math.Round(8*math.Sin(a)))
			c.Set(px, py, white)
		}
	}
	// Arcos: marco blanco con red gris claro, fuera de la línea de meta.
	for _, side := range []int{-1, 1} {
		edge := x0
		if side == 1 {
			edge = x1
		}
		ax, bx := edge-4, edge-1
		if side == 1 {
			ax, bx = edge+1, edge+4
		}
		for y := my - 7; y <= my+7; y++ {
			for x := ax; x <= bx; x++ {
				v := n("gris-claro")
				if (x+y)%2 == 0 {
					v = n("gris")
				}
				c.Set(x, y, v)
			}
		}
		for x := ax; x <= bx; x++ {
			c.Set(x, my-8, white)
			c.Set(x, my+8, white)
		}
		pole := ax // el poste del fondo, lejos de la línea de meta
		if side == 1 {
			pole = bx
		}
		for y := my - 8; y <= my+8; y++ {
			c.Set(pole, y, white)
		}
	}
	return c
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
