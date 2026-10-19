// Punto de entrada del frontend: gestor de escenas y bucle de dibujo.
//
// Cada escena es { mount(root), unmount(), update(dt), draw(ctx) } y puede
// declarar `layout` para el acomodo de la página y la escala del canvas:
//   layout = { kind: "full" | "play", reserveW, reserveH, maxScale }
// update recibe dt en segundos SIN pausa ni velocidad: eso lo aplica cada
// escena (la de juego congela su update en pausa y multiplica dt).
import { loadConfig, saveConfig } from "./ui/settings.js";
import { chooseScale } from "./ui/model.js";
import { createMenuScene } from "./scenes/menu.js";
import { createConfigScene } from "./scenes/config.js";
import { createGameScene } from "./scenes/game.js";
import { createScenarioScene } from "./scenes/scenario.js";
import { Camera, TILE_SIZE, attachCameraControls, drawWorld, generateWorld } from "./world/index.js";
import { Director, SquareRenderer } from "./entities/index.js";
import { loadPhrases } from "./ui/bubble.js";

const appEl = document.getElementById("app");
const canvas = document.getElementById("screen");
const hud = document.getElementById("hud");
const ctx = canvas.getContext("2d");

const SCENES = {
  menu: createMenuScene,
  config: createConfigScene,
  game: createGameScene,
  scenario: createScenarioScene,
};

// Las escenas de juego reciben `build`, que arma el mapa y el director cuando
// ya se sabe cuántas habitaciones tiene el hospital (después de reset o de
// scenarioStart). Ver la cabecera de scenes/game.js.
const PLAY_SCENES = new Set(["game", "scenario"]);
let cameraControls = null;

function integrationParams(name) {
  return PLAY_SCENES.has(name) ? { build: buildStage } : {};
}

async function buildStage(snapshot, config) {
  const world = generateWorld({ rooms: snapshot.rooms.length });
  const camera = new Camera(canvas.width, canvas.height, world.cols * TILE_SIZE, world.rows * TILE_SIZE);
  camera.centerOn((world.spawn.tx + 0.5) * TILE_SIZE, (world.spawn.ty - 4) * TILE_SIZE);

  // Un mundo nuevo por cada hospital: los controles del anterior se sueltan.
  cameraControls?.detach();
  cameraControls = attachCameraControls(camera, canvas);

  const director = new Director(world, {
    robots: config.robots,
    rng: Math.random,
    phrases: await loadPhrases(),
  });
  return {
    world,
    camera,
    director,
    renderer: new SquareRenderer(),
    drawWorld,
    wasDrag: () => cameraControls?.wasDrag() ?? false,
  };
}

// Estado compartido entre escenas. La configuración vive en memoria aunque
// localStorage no exista; saveConfig solo intenta persistirla.
const app = {
  canvas,
  config: loadConfig(),
  showScene,
  setConfig(config) {
    app.config = { ...config };
    saveConfig(app.config);
  },
};

let current = null;
let currentName = "";

export function showScene(name, params = {}) {
  const factory = SCENES[name];
  if (!factory) throw new Error(`escena desconocida: ${name}`);
  if (current) {
    try {
      current.unmount();
    } catch (err) {
      console.error(err);
    }
  }
  hud.replaceChildren();
  if (!PLAY_SCENES.has(name)) {
    cameraControls?.detach();
    cameraControls = null;
  }
  currentName = name;
  current = factory({ ...integrationParams(name), ...params }, app);
  appEl.dataset.scene = name;
  appEl.dataset.layout = current.layout?.kind ?? "full";
  current.mount(hud);
  fitCanvas();
  return current;
}

// fitCanvas elige la escala entera del canvas según el espacio que deja la
// escena para sus paneles (a 1280×800 la escena de juego queda en ×2).
function fitCanvas() {
  const { reserveW = 32, reserveH = 32, maxScale = 4 } = current?.layout ?? {};
  const scale = chooseScale(window.innerWidth - reserveW, window.innerHeight - reserveH, { min: 1, max: maxScale });
  document.documentElement.style.setProperty("--scale", String(scale));
}

window.addEventListener("resize", fitCanvas);

let last = performance.now();
let failures = 0;

function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (current) {
    try {
      current.update(dt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      current.draw(ctx);
      failures = 0;
    } catch (err) {
      // Un error en una escena no debe matar el bucle; se reporta pocas veces.
      if (failures++ < 3) console.error(`escena ${currentName}:`, err);
    }
  }
  requestAnimationFrame(frame);
}

showScene("menu");
requestAnimationFrame(frame);
