// Punto de entrada de web/js/world/: reexporta la interfaz del contrato
// (docs/gui/CONTRACT.md, sección 5) para importar todo desde un solo lugar.

export { TILE, TILE_SIZE, isWalkableTile } from "./tiles.js";
export { generateWorld, zoneAt, roomAt, rectContains, wingDirections, WING_LOCATIONS } from "./generator.js";
export { findPath } from "./astar.js";
export { Camera, attachCameraControls } from "./camera.js";
export { drawWorld, flatPainter, visibleTiles, FLAT_COLORS } from "./render.js";
