// Escena «Simular caso de prueba»: el mismo layout que game, con las
// acciones manuales desactivadas y el botón «Siguiente paso». Al terminar
// muestra las 4 consultas de GET /api/queries.
//
// CONEXIÓN: recibe los mismos params que game (director, world, build...).
import { createPlayScene } from "./game.js";

export function createScenarioScene(params, app) {
  return createPlayScene(params, app, { mode: "scenario" });
}
