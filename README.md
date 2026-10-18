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

## Estructura

```
main.go        escenario de demostración e impresión
menu.go        menú interactivo (lectura de stdin)
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
- **Errores.** Ningún caso previsto entra en pánico. La falta de cama es el error centinela `ErrNoRoomAvailable` y se detecta con `errors.Is`. `RegisterEpisode` deja el episodio registrado aunque no haya cama.
- **Estados.** Los estados y niveles son constantes tipadas con `String()`. `Location` también es un tipo, para evitar errores al escribir los nombres de las ubicaciones; por eso `Attend` recibe un `Location` y no un `string`.
- **Consultas.** Devuelven datos: `[]*Patient`, `[]EpisodeRecord`, `map[*Patient]int`. Toda la impresión ocurre en `main`. `SevereReport` incluye también a los pacientes Severe sin episodios.
- **Historial por doctor.** Cada `Doctor` guarda sus propios `EpisodeRecord`, de modo que `MyEpisodes` no necesita recibir al hospital.
- **Concurrencia.** `Hospital` tiene un `sync.Mutex` que toman todos sus métodos exportados. Si dos goroutines intentan asignar la misma habitación a la vez, la segunda espera, encuentra la cama ocupada y busca otra o recibe `ErrNoRoomAvailable`. Los métodos internos (`assignRoom`, `dispatch`, `hire`) asumen que el lock ya está tomado; así un método exportado puede usar otro sin bloquearse a sí mismo. Los métodos de `Patient` y `Room` no se protegen solos: en código concurrente se usan a través del hospital (por ejemplo, `WakeUpPatient`).
