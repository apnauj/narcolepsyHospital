// Command spritegen genera las hojas de sprites de la interfaz gráfica y su
// manifest a partir de grillas de texto (tools/spritegen/src/*.txt) y de los
// packs CC0 de web/assets/vendor. Se corre desde la raíz del repositorio:
//
//	go run ./tools/spritegen
//
// Escribe web/assets/generated/** y web/assets/sprites.json. Es
// determinista: correrlo dos veces deja el árbol igual.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

func main() {
	root := flag.String("root", "", "raíz del repositorio (por defecto, la carpeta con go.mod)")
	flag.Parse()
	if err := run(*root); err != nil {
		fmt.Fprintln(os.Stderr, "spritegen:", err)
		os.Exit(1)
	}
}

func run(root string) error {
	if root == "" {
		r, err := findRoot()
		if err != nil {
			return err
		}
		root = r
	}
	m, out, err := Build(root)
	if err != nil {
		return err
	}
	data, err := manifestJSON(m)
	if err != nil {
		return err
	}
	assets := filepath.Join(root, "web", "assets")
	if err := out.Flush(assets); err != nil {
		return err
	}
	if err := writeFile(filepath.Join(assets, "sprites.json"), data); err != nil {
		return err
	}
	fmt.Printf("spritegen: %d archivos en web/assets/generated y sprites.json\n", len(out.Files))
	return nil
}

// findRoot sube desde el directorio actual hasta encontrar go.mod.
func findRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("no encontré go.mod; corre desde la raíz del repositorio o usa -root")
		}
		dir = parent
	}
}

// manifestJSON serializa con sangría y salto final (las claves de los
// mapas salen ordenadas, así que es determinista).
func manifestJSON(m *Manifest) ([]byte, error) {
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

// Build arma todo en memoria: el manifest y los archivos a escribir.
func Build(root string) (*Manifest, *Output, error) {
	grids, err := LoadGridDir(filepath.Join(root, "tools", "spritegen", "src"))
	if err != nil {
		return nil, nil, err
	}
	m := &Manifest{
		Version: 1,
		Note:    "Generado por go run ./tools/spritegen. No editar a mano: ver docs/gui/SPRITESHEETS.md.",
		Tile:    16,
		Objects: map[string]SpriteEntry{},
	}
	for _, e := range Palette {
		m.Palette = append(m.Palette, e.Hex)
	}
	out := newOutput()
	if err := buildCharacters(grids, m, out); err != nil {
		return nil, nil, err
	}
	vendor := filepath.Join(root, "web", "assets", "vendor")
	if err := buildObjects(grids, vendor, m, out); err != nil {
		return nil, nil, err
	}
	if err := buildTiles(grids, m, out); err != nil {
		return nil, nil, err
	}
	if err := buildEmotes(vendor, m, out); err != nil {
		return nil, nil, err
	}
	if err := applyOverrides(filepath.Join(root, "tools", "spritegen", "src", "overrides.json"), root, m, out); err != nil {
		return nil, nil, err
	}
	prev, err := buildPreview(grids, m, out)
	if err != nil {
		return nil, nil, err
	}
	if err := out.PNG("generated/preview.png", prev); err != nil {
		return nil, nil, err
	}
	return m, out, nil
}

// buildCharacters genera una hoja por capa y la sección characters.
func buildCharacters(grids map[string]*Grid, m *Manifest, out *Output) error {
	comp := &Composer{Grids: grids}
	layers := Layers()
	idx, err := layerIndex(layers)
	if err != nil {
		return err
	}
	cm := CharManifest{
		Frame:      Size{CharW, CharH},
		Anchor:     Point{CharW / 2, CharH - 1},
		Columns:    SheetCols(),
		Animations: map[string]AnimEntry{},
		LayerOrder: LayerOrder,
		Layers:     map[string][]LayerEntry{},
		Patients:   PatientPools(),
		Staff:      StaffPresets(),
	}
	for i, r := range SheetRows() {
		cm.Rows = append(cm.Rows, RowEntry{r.Anim, r.Dir, len(r.Poses)})
		a := cm.Animations[r.Anim]
		if a.Rows == nil {
			a.Rows = map[string]int{}
		}
		for _, an := range Animations {
			if an.Name == r.Anim {
				a.FPS, a.Loop = an.FPS, an.Loop
			}
		}
		a.Frames = len(r.Poses)
		if r.Dir == "" {
			for _, d := range Dirs {
				a.Rows[d] = i
			}
		} else {
			a.Rows[r.Dir] = i
		}
		cm.Animations[r.Anim] = a
	}
	for _, cat := range LayerOrder {
		for _, l := range layers[cat] {
			e := LayerEntry{ID: l.ID, Name: l.Name}
			if l.Category == "skin" || l.Prefix != "" {
				sheet, err := comp.Sheet(l)
				if err != nil {
					return err
				}
				rel := fmt.Sprintf("generated/characters/%s-%s.png", cat, l.ID)
				if err := out.PNG(rel, sheet); err != nil {
					return err
				}
				e.Sheet = &rel
			}
			cm.Layers[cat] = append(cm.Layers[cat], e)
		}
	}
	// Los pools y presets solo pueden nombrar capas que existen y que son
	// de la categoría correcta.
	for cat, ids := range cm.Patients {
		for _, id := range ids {
			if l := idx[id]; l == nil || l.Category != cat {
				return fmt.Errorf("pool de pacientes %s: capa %q inválida", cat, id)
			}
		}
	}
	kinds := make([]string, 0, len(cm.Staff))
	for k := range cm.Staff {
		kinds = append(kinds, k)
	}
	sort.Strings(kinds)
	for _, k := range kinds {
		for _, p := range cm.Staff[k] {
			for cat, id := range map[string]string{"skin": p.Skin, "torso": p.Torso, "head": p.Head, "accessory": p.Accessory} {
				if l := idx[id]; l == nil || l.Category != cat {
					return fmt.Errorf("preset %s: capa %s %q inválida", p.ID, cat, id)
				}
			}
		}
	}
	m.Characters = cm
	return nil
}
