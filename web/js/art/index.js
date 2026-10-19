// Punto de entrada del arte. SpriteRenderer y tilePainter llegan en la ola 4
// (feature/gui-art) y se apoyan en loadArt().
export { PALETTE, PALETTE_NAMES, color } from "./palette.js";
export {
  loadArt, makeArt, getArt, setArt, sheetPaths,
  animFrame, characterFrame, spriteFrame, objectFor, tileFor, emoteFrame,
} from "./sheets.js";
export { appearanceFor, staffAppearanceFor, layersFor, hash32 } from "./layers.js";
