// Package web contiene el frontend (HTML, CSS, JS y assets) de la interfaz
// gráfica, embebido en el binario para que basta con go run ./cmd/gui.
package web

import "embed"

// FS es la raíz del sitio. Los tests de JS (web/test) no se embeben.
//
//go:embed index.html css js data assets
var FS embed.FS
