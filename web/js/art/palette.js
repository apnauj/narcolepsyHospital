// Paleta Caribe: los mismos 32 colores, en el mismo orden, que
// tools/spritegen/palette.go (lo verifican los tests de Go y de JS). El
// índice i es el carácter i en base 32 de las grillas (0-9, a-v).

/** Colores en orden de índice. */
export const PALETTE = Object.freeze([
  "#2b2118", // 0 tinta
  "#3b4a6b", // 1 sombra-azul
  "#8b97a8", // 2 gris
  "#c7d0d9", // 3 gris-claro
  "#fdf6e3", // 4 blanco-calido
  "#ffffff", // 5 blanco
  "#8fd8c4", // 6 menta
  "#4fa48e", // 7 menta-oscuro
  "#f7c948", // 8 sol
  "#ee8b3a", // 9 naranja
  "#d62839", // a rojo-junior
  "#8e1b2c", // b rojo-oscuro
  "#2f80c2", // c azul-mar
  "#7cc6f0", // d celeste
  "#1d2b3a", // e azul-noche
  "#dcae74", // f madera-clara
  "#9a6339", // g madera-oscura
  "#5bb04a", // h verde-tropical
  "#2e7546", // i verde-oscuro
  "#b4dc5a", // j verde-lima
  "#f8d5b4", // k piel-1
  "#e2ab86", // l piel-1-sombra
  "#dca274", // m piel-2
  "#b97a50", // n piel-2-sombra
  "#a8683f", // o piel-3
  "#84492a", // p piel-3-sombra
  "#6e4128", // q piel-4
  "#4c2a19", // r piel-4-sombra
  "#f39ab5", // s rosado
  "#8a5cc2", // t morado
  "#ecdcab", // u arena
  "#5a3a22", // v cafe-pelo
]);

/** Nombre de cada color, en el mismo orden. */
export const PALETTE_NAMES = Object.freeze([
  "tinta",
  "sombra-azul",
  "gris",
  "gris-claro",
  "blanco-calido",
  "blanco",
  "menta",
  "menta-oscuro",
  "sol",
  "naranja",
  "rojo-junior",
  "rojo-oscuro",
  "azul-mar",
  "celeste",
  "azul-noche",
  "madera-clara",
  "madera-oscura",
  "verde-tropical",
  "verde-oscuro",
  "verde-lima",
  "piel-1",
  "piel-1-sombra",
  "piel-2",
  "piel-2-sombra",
  "piel-3",
  "piel-3-sombra",
  "piel-4",
  "piel-4-sombra",
  "rosado",
  "morado",
  "arena",
  "cafe-pelo",
]);

/** Color por nombre, por ejemplo color("rojo-junior"). */
export function color(name) {
  const i = PALETTE_NAMES.indexOf(name);
  if (i < 0) throw new Error(`color desconocido: ${name}`);
  return PALETTE[i];
}
