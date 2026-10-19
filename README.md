# Hospital de los Costeños con Narcolepsia

Trabajo de Programación Orientada a Objetos (Universidad EIA) en Go, usando solo la biblioteca estándar.

**Integrante:** Juan Pablo Alzate

## Cómo ejecutar

Requiere Go 1.21 o superior.

```sh
go run .            # menú: 1 = escenario de demostración, 2 = menú interactivo
go run -race .      # lo mismo, con el detector de carreras
go test ./...       # pruebas
go test -race ./... # pruebas, incluida la simulación concurrente, con el detector de carreras
```

La opción **1** ejecuta exactamente el escenario de la sección 6 del enunciado e imprime las cuatro consultas, marcadas como `[5.1]` a `[5.4]`.
La opción **2** abre un menú sobre los mismos datos iniciales. Ahí se pueden provocar ataques, despertar pacientes, asignar camas, hacer las consultas y lanzar la simulación concurrente.

## Interfaz gráfica (bonus)

```sh
go run ./cmd/gui    # abre http://localhost:8080 (cambia el puerto con -addr)
```

Es un mapa 2D en pixel art del hospital, servido por una API REST hecha con `net/http`, que consume un frontend HTML/JS en canvas. Desde el menú se puede:

- **Iniciar:** modo libre, con las habitaciones, el personal y los pacientes de la configuración. Se agregan pacientes, doctores y camilleros, se provocan ataques y se despierta a cualquier paciente dormido.
- **Simular caso de prueba:** el mismo escenario de `go run .`, paso a paso, con las cuatro consultas al final.
- **Configuración:** de 2 a 10 habitaciones, personal inicial, de 1 a 3 camillas robot, velocidad, panel de colas y volumen de la música y de los efectos.

La música de fondo (`web/assets/audio/musica.mp3`) arranca con el primer clic o tecla, porque los navegadores no dejan reproducir sonido antes. Se silencia con el botón ♪.

El paquete `hospital` no cambió para la interfaz y no sabe que existe:

- La API toma una foto del estado público antes y después de cada comando y le devuelve a la vista los eventos que salen de compararlas (`api/events.go`).
- El panel de colas se dibuja solo con esa foto, así que muestra exactamente lo que dicen `WaitingForRoom()` y `WaitingForStaff()`.
- Las camillas robot son solo visuales: muestran cómo llega a su cama un paciente que consiguió habitación sin que nadie lo atienda.
- El contrato entre las dos partes está en `docs/gui/CONTRACT.md`.

Pruebas del frontend: `cd web && node --test "test/*.test.js"` (Node 22).

**Arte.** Los personajes (por capas: piel, ropa, peinado o vueltiao, accesorios), las camas, el monitor, la silla Rimax, el picó, la camilla robot y los letreros son propios. Los genera `go run ./tools/spritegen` a partir de grillas de texto en `tools/spritegen/src/`. Muebles y plantas vienen de packs de Kenney, los emotes de Ninja Adventure (Pixel-boy y AAA) y la fuente es Public Pixel (GGBotNet). Todo eso es CC0 y está detallado en `web/assets/LICENSES.md`. El formato de las hojas de sprites está en `docs/gui/SPRITESHEETS.md`.

## Estructura

```
main.go        escenario de demostración e impresión
menu.go        menú interactivo (lectura de stdin)
demo/          datos del escenario, compartidos por la consola y la interfaz gráfica
api/           API REST de la interfaz gráfica (adaptador sobre hospital)
cmd/gui/       servidor de la interfaz gráfica
web/           frontend: mapa, entidades animadas, paneles (JS sin dependencias)
tools/spritegen/ generador de los sprites propios (solo biblioteca estándar)
hospital/      modelo: no imprime nada ni sabe nada de la interfaz
  person.go            Person: identidad embebida en Patient, Doctor y Orderly
  patient.go           Patient y sus estados (PatientState, NarcolepsyLevel)
  doctor.go            Doctor (implementa Attender)
  orderly.go           Orderly, el camillero (implementa Attender, no diagnostica)
  attender.go          interfaz Attender
  room.go              Room y RoomState
  episode.go           EpisodeRecord
  emergency_contact.go EmergencyContact (email y/o teléfono)
  location.go          Location: ubicaciones como constantes tipadas
  hospital.go          Hospital: operaciones y consultas
  simulation.go        simulación concurrente (bonus)
  hospital_test.go
```

## Decisiones de diseño

- **Encapsulación.** Todos los campos están en minúscula. Desde fuera del paquete solo se accede con métodos, y los métodos que devuelven slices entregan copias.
- **Composición.** `Person` se embebe por valor en `Patient`, `Doctor` y `Orderly`. Así los tres reciben `ID()` y `Name()` sin repetir campos, y `Doctor` y `Orderly` cumplen parte de `Attender` con esos métodos promovidos.
- **Polimorfismo.** El hospital guarda su personal en un `[]Attender` y despacha por turnos (round-robin) entre quienes estén libres: quien atiende un ataque queda ocupado hasta que su paciente despierta, así que el despacho se lo salta. Si nadie está libre, el episodio se registra sin atender y se devuelve `ErrNoStaffAvailable`. El hospital nunca pregunta por el tipo concreto. Para añadir un tipo nuevo (por ejemplo, una enfermera) basta con implementar la interfaz y llamar a `HireStaff`.
- **Colas de espera.** Quien se duerme sin cama entra a la cola de cama, y quien se duerme sin nadie libre entra a la cola de atención. Las dos son FIFO (slices) y las reparte `serveQueues` cada vez que algo se libera: cuando un paciente despierta, o cuando se agrega una habitación o se contrata personal. Primero se reparten las camas, para que el registro de quien por fin es atendido ya incluya su habitación. El episodio que estaba en el historial sin atender se reemplaza por el de quien lo atendió, así que el reporte de severidad no lo cuenta dos veces. Si un paciente que espera se despierta, sale de las colas. En el escenario, la consulta `[5.3]` se hace antes de que Toño despierte y muestra el error; al despertar, la cola le pasa a Wilfrido la habitación 101 y a Karen Ospina.
- **Errores.** Ningún caso previsto entra en pánico. La falta de cama es el error centinela `ErrNoRoomAvailable` y se detecta con `errors.Is`. `RegisterEpisode` deja el episodio registrado aunque no haya cama.
- **Estados.** Los estados y niveles son constantes tipadas con `String()`. `Location` también es un tipo, para evitar errores al escribir los nombres de las ubicaciones; por eso `Attend` recibe un `Location` y no un `string`.
- **Consultas.** Devuelven datos: `[]*Patient`, `[]EpisodeRecord`, `map[*Patient]int`. Toda la impresión ocurre en `main`. `SevereReport` incluye también a los pacientes Severe sin episodios.
- **Historial por doctor.** Cada `Doctor` guarda sus propios `EpisodeRecord`, de modo que `MyEpisodes` no necesita recibir al hospital.
- **Concurrencia.** `Hospital` tiene un `sync.Mutex` que toman todos sus métodos exportados. Si dos goroutines intentan asignar la misma habitación a la vez, la segunda espera, encuentra la cama ocupada y busca otra o recibe `ErrNoRoomAvailable`. Los métodos internos (`assignRoom`, `dispatch`, `hire`) asumen que el lock ya está tomado; así un método exportado puede usar otro sin bloquearse a sí mismo. Los métodos de `Patient` y `Room` no se protegen solos: en código concurrente se usan a través del hospital (por ejemplo, `WakeUpPatient`).
