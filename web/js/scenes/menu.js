// Menú principal: playa caribeña con el hospital entre dos palmeras,
// dibujada con rectángulos en el canvas de 384×216, y tres botones.
import { h } from "../ui/dom.js";

export const HOSPITAL_NAME = "Hospital de los Costeños con Narcolepsia";

const C = {
  sky: ["#5fb4dd", "#7ec8e3", "#9fd8ea", "#c3e8f0"],
  sun: "#f7c948",
  cloud: "#fdf6e3",
  sea: "#2f80c2",
  seaLight: "#5fa6dc",
  foam: "#e8f6f8",
  sand: "#f2d49b",
  sandDark: "#d9b778",
  wall: "#fdf6e3",
  wallShade: "#e6dcc3",
  mint: "#8fd8c4",
  mintDark: "#5fb39c",
  glass: "#2f80c2",
  glassLight: "#8fc6ea",
  ink: "#2b2118",
  red: "#d62839",
  trunk: "#8b5a2b",
  trunkDark: "#6b4220",
  leaf: "#2e8b57",
  leafLight: "#4fb06f",
};

function rect(ctx, color, x, y, w, hh) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(hh));
}

// Círculo relleno hecho de filas de píxeles (sin antialias).
function disc(ctx, color, cx, cy, r) {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

function cloud(ctx, x, y) {
  rect(ctx, C.cloud, x + 4, y, 16, 4);
  rect(ctx, C.cloud, x, y + 4, 28, 5);
  rect(ctx, C.cloud, x + 8, y - 3, 8, 3);
}

// Palmera: tronco curvo por segmentos y hojas en arco que se mecen.
function palm(ctx, baseX, baseY, height, lean, t, phase) {
  const sway = Math.sin(t * 1.3 + phase) * 1.5;
  let x = baseX;
  let y = baseY;
  for (let i = 0; i < height; i += 4) {
    const k = i / height;
    x = baseX + lean * k * k * 18 + sway * k;
    y = baseY - i;
    rect(ctx, (i / 4) % 2 ? C.trunk : C.trunkDark, x - 2, y - 4, 5, 4);
  }
  const cx = Math.round(x);
  const cy = Math.round(y - 4);
  // Seis hojas: dirección horizontal y caída.
  const leaves = [-1, -0.6, -0.25, 0.25, 0.6, 1];
  for (const dir of leaves) {
    for (let s = 0; s < 9; s++) {
      const lx = cx + dir * s * 3 + sway * 0.5;
      const ly = cy - 4 + s * s * 0.18 * (1.2 - Math.abs(dir) * 0.3) - (1 - Math.abs(dir)) * 6 + Math.abs(dir) * s * 0.4;
      rect(ctx, s % 3 === 0 ? C.leafLight : C.leaf, lx - 2, ly, 4, 2);
    }
  }
  disc(ctx, C.trunkDark, cx - 2, cy + 1, 2); // cocos
  disc(ctx, C.trunkDark, cx + 2, cy + 2, 2);
}

function hospital(ctx) {
  const x = 112;
  const y = 74;
  const w = 160;
  const hh = 100;
  // Cuerpo, sombra lateral y techo menta.
  rect(ctx, C.ink, x - 1, y - 1, w + 2, hh + 1);
  rect(ctx, C.wall, x, y, w, hh);
  rect(ctx, C.wallShade, x + w - 10, y, 10, hh);
  rect(ctx, C.mintDark, x - 6, y - 8, w + 12, 8);
  rect(ctx, C.mint, x - 6, y - 8, w + 12, 5);
  // Torre central con la cruz.
  rect(ctx, C.ink, x + 59, y - 31, 42, 24);
  rect(ctx, C.wall, x + 60, y - 30, 40, 23);
  rect(ctx, C.red, x + 77, y - 27, 6, 17);
  rect(ctx, C.red, x + 72, y - 22, 16, 6);
  // Ventanas en dos pisos, con su reflejo.
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 6; col++) {
      if (row === 1 && (col === 2 || col === 3)) continue; // espacio de la puerta
      const wx = x + 10 + col * 24;
      const wy = y + 12 + row * 34;
      rect(ctx, C.ink, wx - 1, wy - 1, 18, 18);
      rect(ctx, C.glass, wx, wy, 16, 16);
      rect(ctx, C.glassLight, wx + 2, wy + 2, 4, 6);
      rect(ctx, C.mintDark, wx - 2, wy + 16, 20, 2); // repisa
    }
  }
  // Puerta doble y alero.
  rect(ctx, C.ink, x + 62, y + 60, 36, 40);
  rect(ctx, C.glass, x + 64, y + 62, 15, 38);
  rect(ctx, C.glass, x + 81, y + 62, 15, 38);
  rect(ctx, C.glassLight, x + 66, y + 64, 3, 10);
  rect(ctx, C.glassLight, x + 83, y + 64, 3, 10);
  rect(ctx, C.red, x + 56, y + 54, 48, 5);
  // Camino de baldosas hasta la arena.
  for (let i = 0; i < 4; i++) rect(ctx, i % 2 ? C.wallShade : C.wall, x + 64 - i * 3, y + hh + i * 4, 32 + i * 6, 4);
}

// drawMenuBackground dibuja la playa animada; t en segundos. La usan el
// menú y la configuración.
export function drawMenuBackground(ctx, t = 0) {
  const W = 384;
  // Cielo en franjas, del más oscuro arriba al más claro en el horizonte.
  C.sky.forEach((color, i) => rect(ctx, color, 0, i * 38, W, 38));
  disc(ctx, C.sun, 326, 40, 15);
  rect(ctx, "#fbe08a", 318, 34, 4, 4);
  // Nubes que se mueven despacio y dan la vuelta.
  const drift = (speed, offset) => ((t * speed + offset) % (W + 60)) - 40;
  cloud(ctx, drift(6, 20), 26);
  cloud(ctx, drift(4, 210), 48);
  cloud(ctx, drift(8, 330), 14);
  // Mar con olas.
  rect(ctx, C.sea, 0, 150, W, 22);
  for (let i = 0; i < 16; i++) {
    const wx = (i * 29 + Math.floor(t * 10)) % (W + 20) - 10;
    rect(ctx, C.seaLight, wx, 156 + (i % 3) * 5, 10, 1);
  }
  rect(ctx, C.foam, 0, 170, W, 2);
  // Arena con granitos fijos (patrón determinista).
  rect(ctx, C.sand, 0, 172, W, 44);
  for (let i = 0; i < 70; i++) rect(ctx, C.sandDark, (i * 53) % W, 176 + ((i * 37) % 38), 2, 1);
  hospital(ctx);
  palm(ctx, 54, 196, 84, 1, t, 0);
  palm(ctx, 334, 200, 76, -1, t, 1.7);
  palm(ctx, 22, 210, 52, 0.6, t, 3.1);
}

export function createMenuScene(_params, app) {
  let t = 0;
  let root = null;

  return {
    layout: { kind: "full", reserveW: 32, reserveH: 32, maxScale: 4 },
    mount(el) {
      root = el;
      const go = (name) => () => app.showScene(name);
      el.append(
        h(
          "div",
          { class: "menu" },
          h("h1", { class: "menu-title ui-box" }, HOSPITAL_NAME),
          h(
            "nav",
            { class: "menu-buttons ui-box" },
            h("button", { class: "btn btn-big", onclick: go("game"), autofocus: true }, "Iniciar"),
            h("button", { class: "btn btn-big", onclick: go("scenario") }, "Simular caso de prueba"),
            h("button", { class: "btn btn-big", onclick: go("config") }, "Configuración"),
          ),
        ),
      );
      el.querySelector(".btn")?.focus();
    },
    unmount() {
      root?.replaceChildren();
      root = null;
    },
    update(dt) {
      t += dt;
    },
    draw(ctx) {
      drawMenuBackground(ctx, t);
    },
  };
}
