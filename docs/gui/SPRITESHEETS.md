# Formato de las hojas de sprites (borrador)

Lo completa `feature/gui-assets`. Requisitos fijos:

- Frame de 16×16 px (los personajes pueden usar 16×20 si el sombrero no cabe; se declara en el manifest).
- Cada hoja es un PNG con transparencia: filas = animación × dirección, columnas = frames.
- `web/assets/sprites.json` describe cada hoja (ruta, tamaño de frame, animaciones con fila, frames y fps,
  capas por categoría). El código lee todo del manifest: reemplazar un PNG por otro con el mismo tamaño
  de frame y el mismo orden no requiere tocar código.
- Paleta única compartida (`tools/spritegen` y `web/js/art/palette.js`).
