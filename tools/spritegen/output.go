package main

import (
	"bytes"
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
)

// toImage convierte un lienzo a imagen con paleta (índice 0 transparente).
func toImage(c *Canvas) *image.Paletted {
	img := image.NewPaletted(image.Rect(0, 0, c.W, c.H), colorPalette())
	for i, v := range c.Pix {
		img.Pix[i] = uint8(v + 1)
	}
	return img
}

// encodePNG codifica de forma determinista (mismo lienzo, mismos bytes).
func encodePNG(c *Canvas) ([]byte, error) {
	var buf bytes.Buffer
	enc := png.Encoder{CompressionLevel: png.BestCompression}
	if err := enc.Encode(&buf, toImage(c)); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// writeFile escribe solo si el contenido cambió, para no tocar fechas sin
// necesidad.
func writeFile(path string, data []byte) error {
	if old, err := os.ReadFile(path); err == nil && bytes.Equal(old, data) {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// Output acumula lo que se va a escribir bajo web/assets.
type Output struct {
	Files    map[string][]byte  // ruta relativa a web/assets -> contenido
	Canvases map[string]*Canvas // los mismos PNG como lienzo (para la vista previa)
	Preview  []byte             // hoja de contacto: va a tools/spritegen/preview.png, no se sirve
}

func newOutput() *Output {
	return &Output{Files: map[string][]byte{}, Canvases: map[string]*Canvas{}}
}

// PNG agrega un lienzo como PNG.
func (o *Output) PNG(rel string, c *Canvas) error {
	if c.W == 0 || c.H == 0 {
		return fmt.Errorf("%s: lienzo vacío", rel)
	}
	data, err := encodePNG(c)
	if err != nil {
		return err
	}
	o.Files[rel] = data
	o.Canvases[rel] = c
	return nil
}

// Flush escribe todo bajo assetsDir. Borra antes los PNG de generated/ que
// ya no se producen, para que no queden hojas huérfanas.
func (o *Output) Flush(assetsDir string) error {
	gen := filepath.Join(assetsDir, "generated")
	err := filepath.Walk(gen, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(assetsDir, p)
		if _, keep := o.Files[filepath.ToSlash(rel)]; !keep {
			return os.Remove(p)
		}
		return nil
	})
	if err != nil {
		return err
	}
	for rel, data := range o.Files {
		if err := writeFile(filepath.Join(assetsDir, filepath.FromSlash(rel)), data); err != nil {
			return err
		}
	}
	return nil
}
