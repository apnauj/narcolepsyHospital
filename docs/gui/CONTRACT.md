# Contrato de la interfaz gráfica

Este documento fija lo que comparten las ramas `feature/gui-*`. Si una rama necesita cambiar algo de aquí, lo dice en su resumen final y no lo cambia por su cuenta en archivos de otra rama.

## 1. Principios

- **El paquete `hospital/` no cambia.** La rúbrica (sección 7) lo exige. Toda rama se verifica con `git diff develop -- hospital/`, que debe salir vacío.
- Las dependencias van en una sola dirección:

  ```
  web (JS en el navegador) --HTTP/JSON--> api --> hospital
                                            \--> demo --> hospital
  ```

- **La lógica decide y la vista anima.** La API ejecuta el comando en el hospital, toma una foto del estado antes y otra después, y devuelve los eventos que salen de compararlas. La vista nunca le avisa nada a la lógica: solo envía comandos del usuario.
- El panel de colas y los indicadores se dibujan **solo** desde `snapshot`, así que muestran exactamente lo que dice la lógica. El mapa anima los eventos y puede ir un poco atrasado.
- Go usa solo la biblioteca estándar. JS usa ES modules, sin bundler, sin npm y sin CDN.

## 2. API HTTP

Todo vive bajo `/api/`, con JSON en UTF-8. Los arrays se serializan siempre como `[]`, nunca `null`.

| Método y ruta | Cuerpo | Respuesta 200 |
|---|---|---|
| `GET /api/state` | — | `Snapshot` |
| `GET /api/locations` | — | `[{id, name}]`: todos los `hospital.Location` válidos |
| `GET /api/queries` | — | `Queries`: las 4 consultas de la sección 5 |
| `POST /api/reset` | `{rooms, doctors, orderlies, patients}` | `Result`, con modo `free` y `events: []` |
| `POST /api/patients` | `{}` | `Result` con `patientAdmitted` |
| `POST /api/staff` | `{kind: "doctor"\|"orderly"}` | `Result` con `staffHired` y, si alguien esperaba atención, `attentionAssigned` |
| `POST /api/attacks` | `{patient: "P-001", location: 34}` | `Result` |
| `POST /api/wakeups` | `{patient: "P-001"}` | `Result` |
| `POST /api/scenario/start` | `{}` | `Result`, con modo `scenario` y `step.index = 0` |
| `POST /api/scenario/next` | `{}` | `Result` con `step` |

Errores:
- `400`: cuerpo inválido o fuera de rango.
- `404`: ID de paciente desconocido.
- `409`: comando imposible en el estado actual, por ejemplo un paciente que ya está dormido, un comando manual en modo `scenario` o un `next` después del último paso.

El cuerpo de un error es `{"error": "mensaje legible"}`.

Sin cama o sin personal libre **no es un error HTTP**: la respuesta es 200 y trae `notices`.

**Reset:**
- Rangos: `rooms` de 2 a 10, `doctors` de 0 a 6, `orderlies` de 0 a 6 y `patients` de 0 a 12. Además, `doctors + orderlies ≥ 1`, porque `RegisterEpisode` falla sin personal.
- Las habitaciones se numeran 101, 102… y tienen capacidad 1.
- Nombres e IDs:
  - Los nombres de pacientes y personal se generan con listas de nombres costeños (`api/names.go`), siempre de forma respetuosa.
  - IDs de pacientes: `P-001`…
  - IDs de doctores: `D-01`…, con especialidad al azar entre las que hay.
  - IDs de camilleros: `O-01`…
  - Los contadores siguen subiendo con `+Paciente`, `+Doctor` y `+Camillero`.
- Límites: 30 pacientes y 12 miembros del personal. Pasarse da `409`.

**Escenario:** `scenario/start` carga `demo.NewHospital()`. Después, `next` ejecuta en orden:
1. Ataque 1 de `demo.Attacks(h)`
2. Ataque 2
3. Ataque 3
4. Ataque 4: Wilfrido queda en las dos colas
5. `[5.3] Asignando habitación a P-004`, con `AssignRoom`, que devuelve el aviso `noRoom`
6. `P-001 Toño Mendoza se despierta`: P-004 recibe la 101 y a Karen

Al terminar el paso 6, `step.done` es `true`. `reset` vuelve al modo `free`.

## 3. Tipos (definidos en `api/types.go`)

```
Snapshot    {hospital, mode, rooms[], staff[], patients[], roomQueue[id], staffQueue[id]}
RoomView    {number, state, capacity, occupants[id]}
StaffView   {id, name, kind: "doctor"|"orderly"|"other", busyWith: patientID|""}
PatientView {id, name, age, level, state, asleep, location: int (0 si despierto),
             room: int (0 si no tiene), attendedBy: staffID|""}
Result      {snapshot, events[], notices[], step?}
Event       {type, patient?, staff?, room?, location?, fromQueue?}
Notice      {kind: "noRoom"|"noStaff", message}
StepView    {index, total, title, done}
Queries     {hallway[id], episodes[{doctor, episodes[EpisodeView]}], severe[{patient, episodes}]}
```

`attendedBy` y `busyWith` salen del historial. Como el último episodio de un paciente dormido es el de su ataque actual, el `Attender` de ese registro es quien lo atiende, o nadie si es `nil`.

## 4. Eventos: cómo se derivan y en qué orden

`Diff(before, after Snapshot) []Event` es una función pura en `api/events.go`. Recorre estos grupos **en este orden**, y dentro de cada grupo usa el orden indicado:

| # | Evento | Condición | Campos | Orden dentro del grupo |
|---|---|---|---|---|
| 1 | `patientAdmitted` | El ID no estaba antes | patient | Admisión |
| 2 | `staffHired` | El ID no estaba antes | staff | Contratación |
| 3 | `patientWoke` | Dormido antes y despierto ahora | patient, room = la cama que tenía antes (0 si no tenía), staff = quien lo atendía antes ("" si nadie) | Admisión |
| 4 | `attackStarted` | Despierto antes y dormido ahora | patient, location | Admisión |
| 5 | `roomAssigned` | `room` era 0 o el paciente estaba despierto, y ahora tiene cama estando dormido | patient, room, fromQueue = si estaba en `before.roomQueue` | Primero los que vienen de cola, en el orden de esa cola; luego por admisión |
| 6 | `queuedForRoom` | Entró a `roomQueue` | patient | Orden de la cola |
| 7 | `attentionAssigned` | `attendedBy` pasó a no vacío, o cambió | patient, staff, fromQueue = si estaba en `before.staffQueue` | Igual que el grupo 5 |
| 8 | `queuedForStaff` | Entró a `staffQueue` | patient | Orden de la cola |

Ejemplos, que también son tests obligatorios en `api`:
- **Caso 1** (hay cama y personal): `attackStarted`, `roomAssigned`, `attentionAssigned`.
- **Caso 2** (hay personal, no hay cama): `attackStarted`, `queuedForRoom`, `attentionAssigned`. Cuando alguien despierta: `patientWoke{room}`, `roomAssigned{fromQueue}`.
- **Caso 3** (hay cama, no hay personal): `attackStarted`, `roomAssigned`, `queuedForStaff`. Cuando se libera alguien del personal: `patientWoke{staff}`, `attentionAssigned{fromQueue}`.
- **Caso 4** (ni cama ni personal): `attackStarted`, `queuedForRoom`, `queuedForStaff`.
- **Paso 6 del escenario:**
  - `patientWoke{P-001, room 101, staff D-01}`
  - `roomAssigned{P-004, 101, fromQueue}`
  - `attentionAssigned{P-004, D-01, fromQueue}`

## 5. Módulos JS y sus interfaces

Coordenadas:
- **tile**: `{tx, ty}`, en celdas de 16×16.
- **mundo**: `{x, y}`, en píxeles.
- **pantalla**: el canvas de 384×216, que se escala por CSS con un factor entero.

### `web/js/world/` (feature/gui-world)

```js
generateWorld({ rooms }) -> World            // rooms: 2..10, determinista
World = {
  cols, rows,                                 // en tiles
  tiles: Uint8Array,                          // índice = ty*cols+tx; valores de TILE
  walkable(tx, ty) -> bool,
  zones: [{ name, location, rect }],          // location = nombre EXACTO de hospital.Location.String()
  rooms: [{ number, rect, door:{tx,ty}, bed:{tx,ty}, bedside:{tx,ty} }],  // number 101.. en orden
  pois:  [{ tx, ty, kind }],                  // "tv", "water", "window", "chair", "coffee", ...
  spawn: { tx, ty },                          // entrada
  robotBase: [{ tx, ty }],                    // 3 puestos de carga
  staffRoom: { rect },
  decor: [{ tx, ty, kind }],                  // para el arte (ventilador, matera, letrero...)
}
zoneAt(world, tx, ty) -> zone | null
TILE = { VOID, FLOOR, WALL, DOOR, ... }       // exportado

findPath(world, from, to, { occupied }) -> [{tx,ty}] | null   // A*, 4 vecinos, desempate estable
class Camera { constructor(viewW, viewH, worldW, worldH); x; y; zoom (1|2);
               pan(dx,dy); centerOn(x,y); toWorld(sx,sy) -> {x,y}; toScreen(wx,wy) -> {x,y} }
attachCameraControls(camera, canvas)          // flechas/WASD y arrastre con el mouse
drawWorld(ctx, world, camera, painter = flatPainter)   // painter(ctx, tile, x, y, tx, ty)
```

Zonas y `Location`, usando los nombres exactos:
- **Entrada:** `Main Entrance`
- **Recepción:** `Reception`
- **Sala de espera:** `Waiting Room`
- **Cafetería:** `Cafeteria`
- **Pasillo del módulo fijo:** `Main Hallway`
- **Sala de personal:** `Administrative Block`
- **Base de las camillas:** `Maintenance Area`
- **Pasillos de las alas, en orden:** `East Hallway`, `West Hallway`, `North Hallway`, `South Hallway`, `Pediatrics Hallway`
- **Baño o bodega de un ala impar:** `Sterilization Unit`

Las habitaciones no son zonas de ataque. Los pacientes despiertos no entran a ellas.

Disposición:
- Un módulo fijo y `ceil(N/2)` alas, cada una con una habitación a cada lado de su pasillo.
- Con N impar, la última ala lleva una habitación y un baño o bodega.
- Con N > 6, las alas se disponen en L o en U.

### `web/js/entities/` (feature/gui-entities)

```js
class Director {
  constructor(world, { robots /*1..3*/, rng })
  sync(snapshot)               // crea entidades que no existan (en world.spawn); no destruye
  apply(events, snapshot)      // convierte eventos en secuencias de tareas
  update(dt)                   // dt en segundos, ya multiplicado por la velocidad
  draw(ctx, camera, renderer)  // ordena por Y y llama a renderer.drawEntity
  pick(wx, wy) -> { kind, id } | null
  robotsFree() -> number       // camillas robot en base; lo usa Indicators
  locationOf(patientId) -> string | null   // nombre de la zona donde está; la usa «Ataque»
  visualStatus(id) -> string   // "caminando" | "atacado" | "esperando" | "en traslado" | "siendo atendido" | "despertando" | "patrullando" | "atendiendo" | "transportando" | "en base"
}
Entity = { kind: "patient"|"doctor"|"orderly"|"other"|"robot", id, x, y, dir: "down"|"up"|"left"|"right",
           anim: "idle"|"walk"|"attack"|"sleep"|"stretcher"|"attend"|"wake"|"push", animTime,
           carrying?: patientId, flags: { alert: bool } }
renderer = { drawEntity(ctx, entity, sx, sy), portrait(kind, id) -> CanvasImageSource }
SquareRenderer                 // cuadritos de colores por kind; se cambia por el de sprites en la ola 4
```

Reglas visuales, que traducen lo que decidió la lógica:
- `attackStarted`: el paciente cae donde está (`attack` y luego `sleep`).
- `roomAssigned`:
  - Si quien lo atiende en `snapshot` es un `orderly`, ese camillero camina hasta el paciente y lo empuja en camilla a la cama.
  - Si no, va una camilla robot libre: sale de su base, lo lleva a la cama y regresa.
  - Si no hay robot libre, el traslado espera al primero que se libere.
  - Si lo atiende un doctor, el doctor camina al `bedside` del cuarto.
- `attentionAssigned`: quien atiende camina hasta el paciente, a su lado en el pasillo o al `bedside` si tiene cama, y se queda con `attend`.
- `queuedForRoom` o `queuedForStaff`: el paciente sigue dormido donde está. Si está en las dos colas, `flags.alert` vale `true` y se dibuja ❗.
- `patientWoke`: `wake`, globo de diálogo y vuelve a pasear. El personal liberado vuelve a patrullar. La cama queda vacía.
- Los pacientes despiertos pasean a `pois` aleatorios. El personal libre patrulla los pasillos. Se evita apilar dos entidades en el mismo tile.

### `web/js/ui/` y `web/js/scenes/` (feature/gui-ui)

```js
// scenes: cada escena es { mount(root), unmount(), update(dt), draw(ctx) }
// main.js tiene el gestor: showScene(name, params)
menu      -> botones Iniciar / Simular caso de prueba / Configuración
config    -> rooms 2..10, doctors, orderlies, patients, robots 1..3, speed 1|2|4, showQueues; guarda en localStorage (try/catch)
game      -> layout mapa + panel derecho + toolbar + registro; recibe { director? } (lo conecta la integración)
scenario  -> game con «Siguiente paso» y acciones manuales desactivadas

QueuePanel(el).render(snapshot, renderer)     // retratos EN ORDEN de roomQueue y staffQueue
Indicators(el).render(snapshot, robotsFree)   // habitaciones libres/ocupadas, personal libre/ocupado, robots
Toolbar(el, handlers).setMode("free"|"scenario")
Card(el).show({ name, role, state, queues, visual })   // ficha al hacer clic
Log(el).push(text)                            // aparece letra por letra
Bubble                                        // globo estilo Pokémon (lo pule feature/gui-polish)
```

La fuente pixel se llama `"PixelFont"` en CSS. Mientras `css/font.css` no exista, se usa `monospace`.

### `web/js/art/` (feature/gui-assets, y después feature/gui-art)

```js
loadArt() -> Promise<Art>           // lee assets/sprites.json; nada de coordenadas en el código
appearanceFor(id) -> { skin, torso, head, accessory }   // determinista por ID (hash)
PALETTE                              // colores de la paleta Caribe (mismo orden que tools/spritegen)
SpriteRenderer(art)                  // misma interfaz que SquareRenderer (ola 4)
tilePainter(art)                     // misma firma que flatPainter (ola 4)
```

## 5b. Ampliación v2: playa, cancha, comida y camiseta de la Selección

Estos nombres los comparten `web/js/world/` (dónde va cada cosa) y el arte (`tools/spritegen`, `sprites.json` y `web/js/art/`, que definen cómo se ve).

- **Tiles nuevos en `TILE`:**
  - `SAND`: arena, caminable.
  - `SEA`: mar, no caminable.
  - El mundo agrega una franja de playa y mar a lo largo de **todo el borde norte**: el hospital queda a la orilla del mar. Esto vale también para las disposiciones en L y U, que crecen hacia el norte.
- **Cancha de fútbol:**
  - Va en el jardín exterior, cerca de la entrada, como un decor con `kind: "cancha"`, `w: 8`, `h: 5`. Su huella es caminable: los pacientes pueden pasear por ella, y es un poi `kind: "cancha"`.
  - Los arcos se dibujan dentro del mismo sprite.
- **Comida en la cafetería**, como decor de 1×1 encima de las mesas, con `onTable: true`. Se dibujan después del decor de la mesa del mismo tile:
  - `kind: "salchipapas"`;
  - `kind: "cervezaAguila"`: botella amarilla y roja, sin el logo oficial de la marca;
  - `kind: "arrozCoco"`: plato de arroz de coco con patacones.
- **Camiseta de la Selección Colombia:** capa de torso `seleccion` (amarilla, con detalles azules y rojos, sin el escudo de la FCF). La usa una parte de los pacientes en `appearanceFor`.
- **Camas en vertical** (`dir` `"down"` o `"up"`): el paciente acostado se dibuja **a lo largo** de la cama, con la cabeza en la cabecera.

## 6. Dueño de cada archivo

| Rama | Es dueña de |
|---|---|
| feature/gui-scaffold | `cmd/gui/`, `web/embed.go`, `web/index.html`, `web/css/base.css`, `web/package.json`, `demo/`, `docs/gui/CONTRACT.md` |
| feature/gui-api | `api/**` (puede completar `api/types.go` sin romper el contrato) |
| feature/gui-world | `web/js/world/**`, `web/test/world*.test.js` |
| feature/gui-assets | `tools/spritegen/**`, `web/assets/**`, `web/js/art/**`, `web/css/font.css`, `docs/gui/SPRITESHEETS.md`, `web/test/art*.test.js` |
| feature/gui-entities | `web/js/entities/**`, `web/test/entities*.test.js` |
| feature/gui-ui | `web/js/ui/**`, `web/js/scenes/**`, `web/js/main.js`, `web/js/api.js`, `web/css/ui.css`, `web/test/ui*.test.js` |
| feature/gui-integration | conexión en `scenes/game.js`, `scenes/scenario.js` y `main.js` |
| feature/gui-art | `web/js/art/**`, `web/assets/**`, `tools/spritegen/**` |
| feature/gui-polish | `web/js/fx/**`, `web/js/ui/bubble.js`, `web/data/phrases.json` |

## 7. Checks de cada rama

```
gofmt -l .                 # sin salida
go vet ./...
go test -race ./...
(cd web && node --test "test/*.test.js")   # con un directorio, Node 22 falla
git diff develop -- hospital/   # vacío
```

Commits:
- Uno por unidad lógica, en español, con prefijo `feat:`, `fix:`, `test:`, `docs:` o `chore:`.
- Terminan con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No se hace merge: lo hace quien integra.
