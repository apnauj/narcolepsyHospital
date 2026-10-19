package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Emotes de Ninja Adventure (CC0): 30 globos de 16×16 en una fila. Los
// nombres dan acceso directo a los que usa el juego; el resto se pide por
// índice.
var emoteNames = map[string]int{
	"shock": 0, "confused": 1, "dizzy": 2, "sad": 3, "bored": 4, "laugh": 5, "suspicious": 6,
	"wink": 7, "annoyed": 8, "grumpy": 9, "happy": 10, "content": 11, "worried": 12, "neutral": 13,
	"sick": 14, "cry": 15, "upset": 16, "smile": 17, "tired": 18, "dots": 19, "exclaim": 20,
	"alert": 21, "question": 22, "person": 23, "questionRed": 24, "heartbreak": 25, "heart": 26,
	"sleep": 27, "star": 28, "cross": 29,
}

const emoteCount = 30

func buildEmotes(vendor string, m *Manifest, out *Output) error {
	sheet := NewCanvas(16*emoteCount, 16)
	for i := 0; i < emoteCount; i++ {
		img, err := loadPNG(filepath.Join(vendor, "ninja-adventure", "emote", fmt.Sprintf("emote%d.png", i+1)))
		if err != nil {
			return fmt.Errorf("emote %d: %w", i+1, err)
		}
		sheet.Blit(quantize(img, 0, 0, 16, 16), i*16, 0)
	}
	m.Emotes = EmoteManifest{Sheet: "generated/emotes.png", Frame: Size{16, 16}, Count: emoteCount, Names: emoteNames, Source: "ninja-adventure"}
	return out.PNG(m.Emotes.Sheet, sheet)
}

// Overrides permite usar arte hecho a mano (o de otro pack) sin tocar
// código: tools/spritegen/src/overrides.json. Las rutas son relativas a
// web/assets. El generador valida tamaños y deja la ruta en el manifest.
type Overrides struct {
	// Objects: clave del manifest ("chair", "bed:down", "robot",
	// "stretcher", "shadow") -> hoja nueva.
	Objects map[string]ObjectOverride `json:"objects"`
	// Layers: "categoría/id" ("torso/camiseta-junior") -> hoja con el mismo
	// orden y tamaño que la generada.
	Layers map[string]string `json:"layers"`
	// Tiles y Emotes: hoja completa con la misma distribución.
	Tiles  string `json:"tiles"`
	Emotes string `json:"emotes"`
}

// ObjectOverride: hoja y, si cambian, tamaño de frame, frames, fps, origen
// o ancla.
type ObjectOverride struct {
	Sheet  string  `json:"sheet"`
	Frame  *Size   `json:"frame"`
	Frames int     `json:"frames"`
	FPS    float64 `json:"fps"`
	Origin *Point  `json:"origin"`
	Anchor *Point  `json:"anchor"`
}

func applyOverrides(path, root string, m *Manifest, out *Output) error {
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var ov Overrides
	if err := json.Unmarshal(data, &ov); err != nil {
		return fmt.Errorf("overrides.json: %w", err)
	}
	assets := filepath.Join(root, "web", "assets")
	// load valida la ruta y deja el PNG (recoloreado) para la vista previa.
	load := func(rel string) (*Canvas, error) {
		if rel == "" || filepath.IsAbs(rel) || strings.Contains(rel, "..") || strings.HasPrefix(rel, "generated/") {
			return nil, fmt.Errorf("overrides.json: ruta inválida %q (relativa a web/assets, fuera de generated/)", rel)
		}
		img, err := loadPNG(filepath.Join(assets, filepath.FromSlash(rel)))
		if err != nil {
			return nil, fmt.Errorf("overrides.json: %s: %w", rel, err)
		}
		b := img.Bounds()
		c := quantize(img, 0, 0, b.Dx(), b.Dy())
		out.Canvases[rel] = c
		return c, nil
	}
	drop := func(rel string) { delete(out.Files, rel) }

	keys := make([]string, 0, len(ov.Objects))
	for k := range ov.Objects {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		o := ov.Objects[k]
		var e *SpriteEntry
		var obj SpriteEntry
		switch k {
		case "robot":
			e = &m.Robot
		case "stretcher":
			e = &m.Stretcher
		case "shadow":
			e = &m.Shadow
		default:
			cur, ok := m.Objects[k]
			if !ok {
				return fmt.Errorf("overrides.json: objeto desconocido %q", k)
			}
			obj = cur
			e = &obj
		}
		c, err := load(o.Sheet)
		if err != nil {
			return err
		}
		drop(e.Sheet)
		e.Sheet, e.X, e.Y, e.Source = o.Sheet, 0, 0, "override"
		if o.Frame != nil {
			e.Frame = *o.Frame
		}
		if o.Frames > 0 {
			e.Frames = o.Frames
		}
		if o.FPS > 0 {
			e.FPS = o.FPS
		}
		if o.Origin != nil {
			e.Origin = o.Origin
		}
		if o.Anchor != nil {
			e.Anchor = o.Anchor
		}
		if c.W < e.Frame.W*e.Frames || c.H < e.Frame.H {
			return fmt.Errorf("overrides.json: %s mide %dx%d; se necesitan %d frames de %dx%d", o.Sheet, c.W, c.H, e.Frames, e.Frame.W, e.Frame.H)
		}
		if e == &obj {
			m.Objects[k] = obj
		}
	}
	for k, rel := range ov.Layers {
		cat, id, ok := strings.Cut(k, "/")
		if !ok {
			return fmt.Errorf("overrides.json: capa %q (use categoría/id)", k)
		}
		found := false
		for i, l := range m.Characters.Layers[cat] {
			if l.ID != id {
				continue
			}
			found = true
			c, err := load(rel)
			if err != nil {
				return err
			}
			wantW, wantH := m.Characters.Columns*m.Characters.Frame.W, len(m.Characters.Rows)*m.Characters.Frame.H
			if c.W != wantW || c.H != wantH {
				return fmt.Errorf("overrides.json: %s mide %dx%d; las hojas de capa miden %dx%d", rel, c.W, c.H, wantW, wantH)
			}
			if l.Sheet != nil {
				drop(*l.Sheet)
			}
			r := rel
			m.Characters.Layers[cat][i].Sheet = &r
		}
		if !found {
			return fmt.Errorf("overrides.json: capa desconocida %q", k)
		}
	}
	for _, sh := range []struct {
		rel  string
		dst  *string
		w, h int
	}{
		{ov.Tiles, &m.Tiles.Sheet, maxTileX(m) + 16, maxTileY(m) + 16},
		{ov.Emotes, &m.Emotes.Sheet, m.Emotes.Count * m.Emotes.Frame.W, m.Emotes.Frame.H},
	} {
		if sh.rel == "" {
			continue
		}
		c, err := load(sh.rel)
		if err != nil {
			return err
		}
		if c.W < sh.w || c.H < sh.h {
			return fmt.Errorf("overrides.json: %s mide %dx%d; se necesitan al menos %dx%d", sh.rel, c.W, c.H, sh.w, sh.h)
		}
		drop(*sh.dst)
		*sh.dst = sh.rel
	}
	return nil
}

func maxTileX(m *Manifest) int {
	x := 0
	for _, t := range m.Tiles.Tiles {
		if v := t.X + (t.Frames-1)*16; v > x {
			x = v
		}
	}
	return x
}

func maxTileY(m *Manifest) int {
	y := 0
	for _, t := range m.Tiles.Tiles {
		if t.Y > y {
			y = t.Y
		}
	}
	return y
}
