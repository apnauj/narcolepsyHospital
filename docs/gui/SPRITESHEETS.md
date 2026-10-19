# Formato de las hojas de sprites

Todo el arte se describe en `web/assets/sprites.json` (el **manifest**). El
frontend (`web/js/art/`) no conoce coordenadas: lee filas, frames, anclas y
orígenes del manifest. Por eso, cambiar un PNG por otro con el mismo formato
no requiere tocar código.

- Herramienta: `go run ./tools/spritegen` desde la raíz. Escribe
  `web/assets/generated/**` y `web/assets/sprites.json`. Es determinista: si
  se corre dos veces, `git status` queda limpio. Un test de Go
  (`TestGeneratedFilesUpToDate`) falla si lo que está en el repositorio no
  coincide con lo que genera.
- Revisión humana: `tools/spritegen/preview.png` (fuera de `web/`, así no se sirve ni se embebe), una hoja de contacto
  ampliada ×4 con todo el arte: personal, pacientes de muestra en todas las
  animaciones, pacientes acostados en camas, camilla y robot, objetos, tiles
  y emotes. El código no la usa.
- Paleta: 32 colores "Caribe", en el mismo orden en
  `tools/spritegen/palette.go` y `web/js/art/palette.js`. También se copia en
  `sprites.json` (`palette`). Los tests de Go y de JS verifican que coincidan.
- Licencias de lo que viene de otros packs: `web/assets/LICENSES.md`.

## 1. Grillas de texto (`tools/spritegen/src/*.txt`)

El arte propio se dibuja como texto, un carácter por pixel:

```
# comentario
@nombre 16x20
....00000000....
...0SSSSSSSS0...
```

- Cada bloque empieza con `@nombre WxH` y sigue con H filas de exactamente W
  caracteres. Los nombres son únicos entre todos los archivos.
- `.` es transparente.
- `0`–`9` y `a`–`v` son colores literales: el índice de la paleta en base 32
  (`0` = tinta, `a` = rojo Junior, `c` = azul mar, `k`..`r` = pieles...). La
  tabla completa está en `palette.go`.
- `A`–`Z` son **ranuras** (slots): su color lo decide quien dibuja la grilla.
  Así se hace el cambio de paleta. Una ranura sin color asignado no se pinta.

| Ranura | Uso |
|---|---|
| `S`, `D` | piel y sombra de piel (4 tonos: `piel-1`..`piel-4`) |
| `E`, `K`, `L` | ojos: `E` pupila de arriba (se borra con ojos cerrados), `K` pupila de abajo, `L` párpado (solo con ojos cerrados) |
| `P`, `R`, `F` | piernas: `P` pantaloneta, `R` pierna baja (pantalón largo o piel), `F` calzado (chancletas azules, abarcas de cuero, tenis blancos...) |
| `A`, `B`, `C`, `G` | ropa: color principal (y manga en las partes de pose), sombra, detalles (flores) |
| `H`, `I` | pelo y su brillo (negro, café, canoso) |
| `X` | campana del estetoscopio (solo la pinta la bata) |

Los errores de formato (fila corta, carácter inválido, bloque incompleto,
nombre repetido) se reportan con archivo y línea.

## 2. Personajes

### Frame y ancla

- Frame de **20×20**. Las grillas de personaje se dibujan de 16×20 y se
  centran con 2 px a cada lado; así el cuerpo acostado y el ala del vueltiao
  caben sin recortarse. El borrador pedía 16×16 o 16×20, pero con 16 de
  ancho el cuerpo acostado se cortaba.
- Filas 0–3: espacio para sombreros y para los "!" y "z". Cabeza en las
  filas 4–12, torso en 13–16 y piernas en 17–19.
- `characters.anchor` = `{x: 10, y: 19}`: el punto entre los pies, el que va
  en la posición de la entidad.
- Estilo: cabezón tipo Pokémon Rojo/Azul, contorno de tinta y frente/espalda/
  perfil. `right` es `left` reflejado.

### Filas y columnas

Todas las hojas de personaje tienen el mismo orden. Las filas son
animación × dirección y las columnas son frames (`characters.columns` = 4).
Las celdas sobrantes de una fila quedan vacías.

| Filas | Animación | Dir | Frames | fps | loop | Qué muestra |
|---|---|---|---|---|---|---|
| 0–3 | `idle` | down, up, left, right | 2 | 1.5 | sí | quieto; el frame 2 parpadea |
| 4–7 | `walk` | down, up, left, right | 4 | 8 | sí | parado, paso A con rebote de 1 px, parado, paso B |
| 8–11 | `attend` | down, up, left, right | 3 | 3 | sí | agachado; mano al frente (con la bata, la campana del estetoscopio); asiente |
| 12–15 | `push` | down, up, left, right | 4 | 8 | sí | camina con las manos al frente (de perfil se ven) |
| 16 | `attack` | todas | 3 | 3 | no | de pie, tambaleo, caída (acostado) |
| 17–20 | `sleep` | right, left, down, up | 2 | 1.5 | sí | acostado, ojos cerrados (la dirección es la de la cama, ver abajo) |
| 21–24 | `stretcher` | right, left, down, up | 1 | — | no | acostado (encima de cama, camilla o robot) |
| 25 | `wake` | todas | 3 | 3 | no | se sienta con ojos cerrados, abre los ojos, se estira |

En el manifest, `characters.animations[anim].rows[dir]` da la fila. Las
animaciones sin dirección repiten la misma fila para las cuatro.

**`sleep` y `stretcher` son direccionales, pero su dirección es la de la
cama**, de la cabecera a los pies (la misma `dir` de la decoración `bed`):

| Fila | Cabeza | Cómo se genera |
|---|---|---|
| `right` | a la izquierda | el frame de pie girado 90° (cara hacia arriba) |
| `left` | a la derecha | el reflejo del anterior |
| `down` | arriba | el frame de pie, de frente, con los ojos cerrados |
| `up` | abajo | el frame de `down` girado 180° |

Así el paciente queda a lo largo de la cama en las 4 orientaciones sin girar
nada en el canvas (a 20×20 el giro de 90° salía feo). La camilla y el robot
usan la fila `right`; quien duerme en el suelo, `right` o `left` según mire.
`characters.rows` lista las filas en orden, con su animación, dirección y
cantidad de frames.

### Capas (muñeco de papel)

Cada capa es una hoja completa con el orden de arriba. Para dibujar un
personaje se dibuja la misma celda de cada capa, en orden
`layerOrder = [skin, torso, head, accessory]`. Una capa con `sheet: null`
(`calvo`, `ninguno`) no se dibuja.

| Categoría | Capas (`id`) |
|---|---|
| `skin` | `piel-1` clara, `piel-2` trigueña, `piel-3` morena, `piel-4` negra. Es el cuerpo base: cara, brazos, piernas. Cada tono es un cambio de paleta de la misma grilla. |
| `torso` | `camiseta-junior` (rayada rojiblanca, sin escudo ni logo, con tenis), `seleccion` (amarilla con cuello azul y franja roja, sin escudo de la FCF; pantaloneta azul y tenis blancos; sale en 1 de cada 5 pacientes), `guayabera-blanca`, `guayabera-crema` (con abarcas), `floreada-azul`/`-amarilla`/`-roja`/`-menta`, `camisilla-blanca` (con chancletas). Personal: `bata` (blanca con estetoscopio), `quirurgico-azul`, `quirurgico-verde`. La ropa incluye pantalón o pantaloneta y calzado. |
| `head` | `pelo-corto-*`, `pelo-crespo-*`, `pelo-cola-*` (moña) en negro, café o canoso; `calvo`; `vueltiao`; `gorro-azul`, `gorro-verde` (quirúrgicos) |
| `accessory` | `ninguno`, `mochila-wayuu`, `abanico`, `gafas-oscuras`, `cadena` |

- `characters.patients`: pools de IDs que le pueden salir a un paciente. Un
  ID repetido pesa más; por ejemplo, `ninguno` sale 3 de cada 7 veces en
  accesorios.
- `characters.staff`: presets fijos por tipo (`doctor`, `orderly`, `other`)
  con `weight`.
  - Doctores: 4 con bata y uno raro, `doctor-vueltiao` (el **huevo de
    pascua**, peso 1 contra 6).
  - Camilleros: uniforme quirúrgico azul o verde, con gorro o sin él.
  - `other`: administrativo y recepcionista.
- JS: `appearanceFor(id)` devuelve `{skin, torso, head, accessory}` como
  índices de `art.characters.layers[cat]`, elegidos por hash FNV-1a de
  `"<id>:<cat>"` dentro del pool. `staffAppearanceFor(kind, id)` elige un
  preset por hash y peso, y `layersFor(appearance)` da las capas a dibujar en
  orden.

### Cómo se generan

`tools/spritegen/character.go` define las poses: piernas, desplazamiento de
cabeza y torso, ojos cerrados, acostado y efectos. Para cada pose y capa
dibuja:

1. Las piernas de esa dirección y pose (`legs_<dir>_<stand|stepA|stepB|crouch>`).
2. El cuerpo base (`body_head_<dir>`, `body_torso_<dir>`), solo en `skin`.
3. La grilla propia de la capa, `<prefijo>_<dir>`. Si una dirección no
   tiene grilla, la capa no pinta nada en ella: las gafas no se ven de
   espaldas.
4. Las partes extra de la pose (`extra_push_*`, `extra_attend_*`). En las
   capas de ropa, la piel de esas partes **borra**, para que la mano quede
   delante de la camisa.

Después refleja para `right`, desplaza (rebote, tambaleo) y, si la pose es
acostada, gira 90° a la izquierda. Los efectos (`fx_*`: «!», «z», estrellitas) van solo en `skin`, pero están
apagados (`BakeFX = false` en `character.go`): los dibujan las partículas de
`web/js/fx`, y en la hoja se duplicarían. Por eso `attack` y `sleep` salen sin
«!» ni «z».

## 3. Objetos y decoración

`objects` usa como clave el **`kind` de la decoración del mapa**
(`web/js/world/modules.js`), con variantes:

- `kind:dir`: por dirección. La cama: `bed:right`, `bed:left`, `bed:down`,
  `bed:up`, donde `dir` es el mismo de la decoración (de la cabecera hacia
  los pies).
- `kind@WxH`: para una huella de W×H tiles (`table@2x1`, `bench@2x1`,
  `hammock@2x1`, `mural@3x1`, `rug@3x2`, `locker@1x2`, `toolShelf@1x2`,
  `workbench@1x2`, `sign@2x1`).
- `kind`: la versión base.

`objectFor(art, decor)` busca en ese orden: `kind:dir`, `kind@WxH` y luego
`kind`. Si el objeto tiene la etiqueta `repeat` (como `counter`), el
renderer lo repite en la huella.

Kinds v2 (CONTRACT.md, 5b): `umbrella` (sombrilla de colores, 16×24: el
toldo sobresale 8 px por arriba y el overlay lo repinta sobre los
personajes), `shell` (concha, `under`), `cancha@8x5` (cancha de fútbol de
128×80 vista desde arriba: pasto rayado, líneas, círculo central, áreas y un
arco con red en cada extremo; es `under` y caminable) y la comida
`salchipapas`, `cervezaAguila` (botella amarilla con banda roja, sin logo) y
`arrozCoco` (arroz de coco con patacones), 1×1 para decoración con
`onTable: true`. El painter repinta antes la mesa del mismo tile, así la
comida queda encima aunque el orden de `decor` no lo asegure.

Kinds cubiertos (un test de Go lo exige): `bed`, `bell`, `bench`, `board`,
`chair` (silla Rimax blanca), `chargePad`, `charger`, `coffeeCart`,
`counter`, `deskChair`, `doorNumber` (plaquita: el número lo escribe el
renderer con la fuente), `doormat`, `extinguisher`, `fan` (ventilador de
techo, 3 frames), `flowers`, `fridge`, `gate`, `glassDoor`, `hammock`,
`linenCart`, `locker`, `menuBoard`, `monitor` (3 frames con la línea
corriendo), `mural`, `nightstand`, `noSleepSign` ("SE PROHÍBE
DORMIR", 47×18, menos de 3 tiles), `palm`, `pico` (2 frames), `plant`, `receptionSign`, `rug`
(tapete wayuu), `shelf`, `sign` (letrero de la entrada: "HOSPITAL DE LOS
COSTEÑOS CON NARCOLEPSIA"), `sink`, `table`, `toilet`, `toolShelf`, `tv`
(partido, 3 frames), `water`, `workbench`. Extras que el mapa aún no pide:
`arbol`, `arbol@1x2`, `arbusto`, `cactus`, `matera-2`, `cuadro`, `botiquin`,
`silla-madera`.

Campos de cada entrada:

| Campo | Significado |
|---|---|
| `sheet`, `x`, `y` | hoja y esquina del primer frame; los frames siguen hacia la derecha |
| `frame {w,h}`, `frames`, `fps` | tamaño y cantidad de frames; `fps` 0 = estático |
| `origin {x,y}` | (decoración) pixel del sprite que cae en la esquina superior izquierda del tile `(tx, ty)` de la decoración. Si no se indica, el sprite se centra en la huella y se apoya en su borde de abajo; por eso la nevera (16×20) tiene `origin {0,4}` y sobresale 4 px hacia arriba. |
| `footprint {w,h}` | tiles que ocupa (como `w`/`h` del mapa) |
| `anchor {x,y}` | (entidades que se mueven) pixel que va en la posición de la entidad |
| `ride {x,y,rotate,flipX}` | dónde va el paciente acostado (ver abajo) |
| `sit {x,y}` | (camas) centro del frame del paciente sentado (`wake`) |
| `mattress {x,y,w,h}` | (camas) rectángulo del colchón: el paciente acostado queda dentro (lo verifica `TestPatientInsideMattress`) |
| `cover {x,y,w,h}` | (camas) parte del sprite (la manta) que el renderer repinta **encima** del paciente para que quede tapado |
| `tags` | `floor` (se ordena por Y con los personajes), `under` (pegado al piso, debajo de todo), `wall` (colgado en un muro), `ceiling` (encima de todo), `repeat` |
| `source` | `propio`, el pack de origen u `override` |

**Ride.** Para dibujar al paciente acostado (frame `stretcher` o `sleep`)
sobre una cama, la camilla (`stretcher`) o la camilla robot (`robot`), el
centro geométrico de su frame de 20×20 va en `(x, y)` del sprite del objeto.
El frame sale de la fila `sleep` o `stretcher` de la dirección de la cama, así
que desde la v2 `rotate` es 0 y `flipX` es `false` en todos (los campos se
conservan por si un override los necesita):

```js
ctx.translate(left + ride.x, top + ride.y);
ctx.rotate(ride.rotate * Math.PI / 180);
ctx.scale(ride.flipX ? -1 : 1, 1);
ctx.drawImage(sheet, sx, sy, 20, 20, -10, -10, 20, 20);
```

`preview.png` muestra el resultado con un paciente en cada cama, en la
camilla y en el robot, y sentado (`wake`) en cada cama. El renderer dibuja
primero al paciente y después repinta `cover`. La cama horizontal ocupa todo
el alto del tile (colchón de 14 px) porque el cuerpo acostado mide 14 px de
ancho; la vertical mide 14 px de ancho y 23 de largo.

**Entidades que se mueven** (fuera de `objects`):

- `robot`: camilla robot de 26×15 con carita LED (2 frames iguales). Sin
  sirena: la dibuja `web/js/fx` cuando lleva a alguien.
- `stretcher`: camilla de 20×16 que empuja el camillero.
- `shadow`: sombra de 12×4 en tinta. El renderer la pinta semitransparente
  bajo los personajes.

## 4. Tiles

`tiles.sheet` es una hoja de tiles de 16×16. `tiles.tiles[nombre]` da
`{x, y, frames, fps}`; los tiles animados van seguidos en la misma fila.
`tiles.byType` traduce cada valor de `TILE` (`web/js/world/tiles.js`) a un
nombre:

| TILE | tile |
|---|---|
| `VOID` | `jardin` |
| `FLOOR` | `piso` |
| `WALL` | `pared` si el tile de abajo no es muro (se ve la cara); si no, `pared-tope` |
| `DOOR` | `puerta-abierta` |
| `BED`, `ROOM_FLOOR` | `piso-menta` |
| `WINDOW` | `ventana` |
| `FURNITURE` | el piso de `decor.under`; si no hay, `piso` |
| `COUNTER` | `mostrador` |
| `GRASS` | `grama` |
| `PATH` | `arena` |
| `HEDGE` | `seto` |
| `WOOD` | `madera` |

| `SAND` | `playa`; el painter usa `playa-orilla` (arena mojada) si el tile de arriba es `SEA` |
| `SEA` | `mar` (2 frames); el painter usa `mar-orilla` (2 frames, con espuma) si el tile de abajo no es mar |

`SAND` y `SEA` (valores 13 y 14 de `TILE` en la rama del mapa) se leen de
forma tolerante: si el mundo no los define, el painter no cambia nada.

Otros tiles: `puerta` (de vidrio, cerrada), `tapete` y `vacio`.

## 5. Emotes y fuente

- `emotes`: 30 globos de 16×16 de Ninja Adventure en una fila. `names` da
  acceso directo (`alert`, `exclaim`, `question`, `sleep`, `heart`, `cross`,
  `dots`, `happy`...).
- Fuente: `web/css/font.css` define la familia `"PixelFont"` (Public Pixel,
  woff2). Se ve nítida en tamaños múltiplos de 8 px. `index.html` todavía no
  la enlaza: lo hace la integración.

## 6. Reemplazar un sprite sin tocar código

**Opción durable (recomendada).** Pon el PNG en `web/assets/custom/` (o en
otra carpeta fuera de `generated/`) y decláralo en
`tools/spritegen/src/overrides.json`:

```json
{
  "objects": {
    "chair": { "sheet": "custom/silla.png" },
    "monitor": { "sheet": "custom/monitor.png", "frame": { "w": 16, "h": 16 }, "frames": 4, "fps": 6 },
    "robot": { "sheet": "custom/robot.png", "frame": { "w": 32, "h": 20 }, "frames": 2, "anchor": { "x": 16, "y": 19 } }
  },
  "layers": { "torso/camiseta-junior": "custom/junior.png" },
  "tiles": "custom/tiles.png",
  "emotes": ""
}
```

Después corre `go run ./tools/spritegen`. El generador:

- valida el tamaño: un objeto necesita al menos `frames` × `frame` y una capa
  debe medir exactamente lo mismo que la hoja generada;
- deja de escribir la hoja que se reemplaza;
- pone la ruta nueva en el manifest con `source: "override"`;
- muestra el arte nuevo en `preview.png`.

Las claves válidas son las de `objects`, más `robot`, `stretcher` y `shadow`.
El PNG puede tener cualquier color: no hace falta que use la paleta.

**Otras formas:**

- **Editar el dibujo:** cambia la grilla en `src/*.txt` y vuelve a generar.
  Para un personaje nuevo, agrega sus grillas y una capa en `Layers()`
  (`character.go`). Si va a pacientes, súmala a `PatientPools()`; si va al
  personal, a `StaffPresets()`.
- **Sin generador (rápido, se pierde al regenerar):** sobrescribe el PNG de
  `generated/` con uno del mismo tamaño y el mismo orden de frames.
- **Otro pack:** agrega el recorte en `decorCatalog()` (`objects.go`) con
  `kenney(...)` u otra fuente, o usa un override. Los recortes de packs se
  recolorean a la paleta Caribe para que todo combine.

## 7. Pendiente y límites conocidos

- `attack` y `wake` no tienen dirección: siempre miran hacia abajo (`attack`
  cae con la cabeza a la izquierda). `sleep` y `stretcher` sí (la de la cama).
- Sentado (`wake`) en una cama vertical, el paciente se dibuja de frente y de
  pie sobre la cama, con la manta encima de las piernas.
- `push`: de frente y de espaldas, las manos quedan tapadas por la camilla,
  así que es igual que `walk`; de perfil se ven las manos al frente.
- `wake` "se estira" con un salto y el cuello estirado; no hay brazos
  arriba.
- La camilla siempre se dibuja horizontal.
- El letrero de la entrada está en mayúsculas de letrero y no tiene
  minúsculas, porque la fuente 3×5 del arte solo tiene mayúsculas.
