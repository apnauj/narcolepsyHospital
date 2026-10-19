// Tipos de tile del mapa y reglas de qué se puede caminar.
//
// Los valores son pequeños enteros porque el mapa se guarda en un Uint8Array.
// El arte (painter) decide cómo se ve cada uno; aquí solo vive la semántica.

/** Lado de un tile en píxeles de mundo. */
export const TILE_SIZE = 16;

/** Tipos de tile. El índice de `World.tiles` guarda uno de estos valores. */
export const TILE = Object.freeze({
  VOID: 0,        // exterior: jardín tropical que no se pisa
  FLOOR: 1,       // baldosa clínica (pasillos, recepción, sala de espera, baño)
  WALL: 2,
  DOOR: 3,        // puerta o vano en un muro; se camina
  BED: 4,         // cama de habitación; no se camina
  WINDOW: 5,      // ventana en un muro exterior; no se camina
  FURNITURE: 6,   // mueble sólido (matera, nevera, palmera, mesa...)
  COUNTER: 7,     // mostrador o barra
  GRASS: 8,       // grama de la entrada; se camina
  PATH: 9,        // caminito de la entrada; se camina
  HEDGE: 10,      // seto que cierra la entrada
  ROOM_FLOOR: 11, // piso de habitación
  WOOD: 12,       // piso de madera clara (cafetería, sala de personal)
});

const WALKABLE = new Set([
  TILE.FLOOR, TILE.DOOR, TILE.GRASS, TILE.PATH, TILE.ROOM_FLOOR, TILE.WOOD,
]);

const WALL_LIKE = new Set([TILE.WALL, TILE.WINDOW, TILE.DOOR]);

/** true si un personaje puede pararse en un tile de este tipo. */
export function isWalkableTile(tile) {
  return WALKABLE.has(tile);
}

/** true si el tile forma parte de un muro (muro, ventana o puerta). */
export function isWallLike(tile) {
  return WALL_LIKE.has(tile);
}
