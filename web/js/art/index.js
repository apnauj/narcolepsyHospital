// Punto de entrada del arte: carga (loadArt), apariencias y los dos dibujantes
// (SpriteRenderer para entidades, tilePainter para el mapa).
export { PALETTE, PALETTE_NAMES, color } from "./palette.js";
export {
  loadArt, makeArt, getArt, setArt, sheetPaths,
  animFrame, characterFrame, spriteFrame, objectFor, tileFor, emoteFrame,
} from "./sheets.js";
export { appearanceFor, staffAppearanceFor, layersFor, hash32 } from "./layers.js";
export { SpriteRenderer, FOOT_DY } from "./spriteRenderer.js";
export { tilePainter } from "./tilePainter.js";
