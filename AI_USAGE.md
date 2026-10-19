# Uso de IA

## Herramientas y para qué

- **Claude Code (Claude Opus 5.5 y Sonnet 5.5)**, para:
  - revisar el enunciado y el código que ya existía;
  - proponer el plan y las preguntas de diseño;
  - implementar el paquete `hospital`, los tests, el programa de consola y la simulación concurrente;
  - redactar el borrador de este archivo y el README;
  - la interfaz gráfica (bonus): la API REST, el frontend, el generador de sprites y los efectos. Se hizo por partes, con varios subagentes en paralelo, cada uno en su rama y su worktree, sobre un contrato común (`docs/gui/CONTRACT.md`).
- Yo tomé las decisiones de alcance: seguir la estructura del enunciado, eliminar `internal/service`, añadir la concurrencia, ofrecer escenario o menú en `main`, despachar por round-robin y dejar la interfaz de notificaciones para hacerla yo.

## Prompts decisivos

1. El prompt inicial. Pedía leer el enunciado y revisar la estructura existente, y **antes de escribir código** presentar qué estaba hecho, qué faltaba, un plan y las dudas, para que yo lo aprobara. Ponía como reglas: solo biblioteca estándar, nada extra, código idiomático y un `main` con menú por consola.
2. La respuesta al plan: *"seguimos directamente la estructura del profe"*, *"la concurrencia sí impleméntala"*, *"quiero que el main tenga las dos opciones"*, *"trabajemos con gitflow"*.
3. El prompt de la GUI. En él especifiqué la estética, de dónde debían venir los recursos visuales y cómo debía funcionar cada parte de la interfaz. Lo pulí y lo revisé antes de pasárselo al agente que se encargó de orquestar los subagentes que escribieron el código de la GUI.

## Casos en que el código generado estaba mal o no era idiomático

1. En `readInt` la IA llamó `min` y `max` a los parámetros. Desde Go 1.21 esos nombres son funciones predefinidas (built-ins), y el parámetro las tapaba dentro de la función. Se renombraron a `lo` y `hi`.
2. En el escenario usó la variable `toño`. Es un identificador válido en Go (acepta letras Unicode), pero es incómodo de escribir y poco habitual. Se cambió a `tono`.
3. En el escenario se llamaba a `freed.Number()` sin comprobar si `freed` era `nil`. Si el paciente no hubiera tenido habitación, el programa habría hecho panic. Se añadió la comprobación.
4. El código que había en el repositorio antes de empezar tenía `narcolepsyLevel` como `string` en vez de constante tipada, punteros innecesarios a `PatientState` y `Location`, y un `internal/service` que llamaba a `hospital.NewDoctor`, que no existía. Ese código lo había escrito yo mientras aprendía y entendía los temas relacionados. La IA me ayudó a detectar esos problemas y a mejorar el código para que fuera de mejor calidad.
5. El despacho por round-robin que generó la IA le daba el ataque al siguiente de la lista aunque esa persona estuviera atendiendo a otro paciente. En el escenario, Karen Ospina atendía a Wilfrido mientras Toño, también suyo, seguía dormido. El enunciado pide despachar a quien esté *disponible*. Lo detecté yo al revisar la guía. Decidí que quien atiende queda ocupado hasta que su paciente despierta y que, si nadie está libre, el episodio igual se registra, sin atender, con el error `ErrNoStaffAvailable`. Se añadieron dos tests: `TestDispatchSkipsBusyStaff` y `TestNoStaffAvailable`.
6. Después de ese arreglo quedó otro vacío, que también detecté yo: un paciente que se dormía sin cama y sin nadie libre se quedaba así para siempre, porque al liberarse una cama o un doctor nadie se los pasaba. Pedí una cola. Se implementaron dos colas FIFO (cama y atención) que se reparten cada vez que algo se libera. El episodio sin atender se reemplaza en el historial por el de quien lo atendió. Se cambió `TestWakeUpFreesRoomForHallwayPatient` por `TestWakeUpGivesRoomToNextInQueue` y se añadió `TestWakeUpFreesStaffForNextInQueue`.
7. Al probar la interfaz gráfica en el navegador, la IA encontró fallos en el código que ella misma había generado:
   - En el caso de prueba, el paciente caía donde estaba su figura (la entrada) y no donde decía la lógica (la cafetería). Se corrigió en el director de animaciones y se añadió un test que lo comprueba.
   - El indicador de camillas robot no se actualizaba, porque solo se redibujaba al llegar una respuesta de la API.
   - La fuente pixel desbordaba los paneles.

## Qué aprendí

Durante este trabajo aprendí muchas cosas y creo que de verdad entendí cómo funciona la programación orientada a objetos en Go y la sintaxis del lenguaje. Fue un ejercicio muy interesante analizar el sistema y definir su comportamiento a partir de los requerimientos. Además, acompañar el trabajo con una guía que me iba explicando y enseñando fue algo genial que voy a seguir aplicando. Esto me permitió entender el código no solo de manera general, sino a profundidad en cada una de sus partes, y hacerme preguntas sobre él.
