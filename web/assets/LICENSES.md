# Licencias de los assets

Todo el arte de terceros es **CC0 1.0** (dominio público). No se exige
atribución, pero se da crédito a sus autores. Cada carpeta de `vendor/` trae
el archivo de licencia original del pack. Se copiaron solo los archivos que
se usan; el resto de cada pack no está en el repositorio.

| Pack | Autor | Origen | Licencia | Archivos usados | Para qué |
|---|---|---|---|---|---|
| Roguelike Indoors | Kenney (kenney.nl) | https://kenney.nl/assets/roguelike-indoors | CC0 1.0 (`vendor/kenney-roguelike-indoors/License.txt`) | `roguelikeIndoor_transparent.png` (22 KB) | Muebles recoloreados a la paleta Caribe: `plant`, `nightstand`, `sink`, `shelf`, `counter` (y el tile `mostrador`), `deskChair`, `table`, `table@2x1`, `matera-2`, `cuadro`, `botiquin`, `silla-madera` |
| Roguelike/RPG pack | Kenney (kenney.nl), con Lynn Evers | https://kenney.nl/assets/roguelike-rpg-pack | CC0 1.0 (`vendor/kenney-roguelike-rpg-pack/License.txt`) | `roguelikeSheet_transparent.png` (94 KB) | Plantas de exterior recoloreadas: `flowers`, `arbol`, `arbol@1x2`, `arbusto`, `cactus` |
| Ninja Adventure | Pixel-boy y AAA | https://pixel-boy.itch.io/ninja-adventure-asset-pack | CC0 1.0 (`vendor/ninja-adventure/LICENSE.txt`; `README.md` del pack lo confirma) | `emote/emote1.png` … `emote30.png` (30 PNG de 16×16) | Globos de emoción (`generated/emotes.png`) |
| Public Pixel | GGBotNet | https://ggbot.itch.io/public-pixel-font | CC0 1.0 (`vendor/public-pixel/License.txt`) | `PublicPixel.woff2` (21 KB) | Fuente `"PixelFont"` (`css/font.css`); tiene tildes, ñ, ¿ y ¡ |

Todo lo demás (personajes y sus capas, camilla, camilla robot, camas,
monitor, silla Rimax, picó, TV, letreros, palmera, ventilador, hamaca,
tapete wayuu, mural, tiles de piso y pared, etc.) es arte propio del
proyecto, generado por `tools/spritegen` a partir de `tools/spritegen/src/*.txt`.

## Evaluados y no usados

- **Kenney Roguelike Characters** (CC0, https://kenney.nl/assets/roguelike-characters):
  se descargó y se revisó, pero sus personajes solo miran de frente, no traen
  ciclo de caminata y no son cabezones. No sirven de base para un sistema de
  capas en 4 direcciones al estilo Pokémon, así que la base es propia y el
  pack no se copió.
- **Pixel Operator** (Jayvee Enaguas, CC0): los repositorios de su autor
  (notabug, codeberg, GitHub, itch.io) ya no responden y solo quedan espejos
  de terceros, que no estaban entre las fuentes permitidas. No hizo falta:
  Public Pixel cubre todos los caracteres del español.
