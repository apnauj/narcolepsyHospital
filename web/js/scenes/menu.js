// Menú principal: escena del Caribe animada en el canvas de 384×216 (mar,
// sol, nubes, gaviotas, palmeras, hospital con letrero, picó, paciente
// dormido en silla Rimax) y, encima, el título y los botones en DOM.
import { h } from "../ui/dom.js";
import { bindMusicButton } from "../ui/music.js";

export const HOSPITAL_NAME = "Hospital de los Costeños con Narcolepsia";
export const SUBTITLE = "Urgencias con sabor a Caribe y mucha siesta";

const W = 384;
const HORIZON = 132; // donde acaba el cielo y empieza el mar
const SHORE = 172; // donde acaba el mar y empieza la arena
// El hospital mide 120 px de ancho y su torre empieza en y=70, debajo del
// título y el subtítulo (que van en el DOM sobre la franja de arriba).
const HX = 226; // esquina izquierda del hospital
const HY = 96; // techo del edificio
const HW = 120;

const C = {
  sky: ["#4fa6d6", "#6fbfe0", "#92d3e6", "#b9e6ee"],
  sun: "#f7c948",
  sunLight: "#fbe08a",
  cloud: "#fdf6e3",
  cloudShade: "#d9e8ee",
  sea: "#2f80c2",
  seaDeep: "#2a70b0",
  seaLight: "#5fa6dc",
  foam: "#e8f6f8",
  sand: "#f2d49b",
  sandDark: "#d9b778",
  sandWet: "#e0bd80",
  wall: "#fdf6e3",
  wallShade: "#e6dcc3",
  mint: "#8fd8c4",
  mintDark: "#5fb39c",
  glass: "#2f80c2",
  glassLight: "#8fc6ea",
  ink: "#2b2118",
  red: "#d62839",
  white: "#ffffff",
  wood: "#c58b4a",
  woodDark: "#8b5a2b",
  trunk: "#8b5a2b",
  trunkDark: "#6b4220",
  leaf: "#2e8b57",
  leafLight: "#4fb06f",
  skin: "#d9996a",
  yellow: "#f7c948",
  blue: "#2f80c2",
  green: "#3fa66b",
  plastic: "#f4f1e8",
  plasticShade: "#cfc9b8",
};

// ---------- Navegación con teclado (pura, probada en Node) ----------

// menuNav devuelve el nuevo índice seleccionado según la tecla, o null si la
// tecla no navega. index -1 = ninguno seleccionado; la selección da la vuelta.
export function menuNav(index, key, count) {
  if (!(count > 0)) return null;
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return index < 0 ? 0 : (index + 1) % count;
    case "ArrowUp":
    case "ArrowLeft":
      return index < 0 ? count - 1 : (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

// ---------- Primitivas ----------

function rect(ctx, color, x, y, w, hh) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(hh));
}

// Círculo relleno hecho de filas de píxeles (sin antialias).
function disc(ctx, color, cx, cy, r) {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2 + 1, 1);
  }
}

const px = (ctx, color, x, y) => rect(ctx, color, x, y, 1, 1);

function cloud(ctx, x, y) {
  rect(ctx, C.cloud, x + 4, y, 16, 4);
  rect(ctx, C.cloud, x, y + 4, 28, 5);
  rect(ctx, C.cloud, x + 8, y - 3, 8, 3);
  rect(ctx, C.cloudShade, x + 2, y + 8, 24, 1);
}

// Gaviota: dos alas de píxeles que suben y bajan.
function gull(ctx, x, y, t, phase) {
  const up = Math.floor(t * 4 + phase) % 2 === 0;
  const dy = up ? -1 : 1;
  for (let i = 1; i <= 4; i++) {
    const wy = y + (i > 2 ? dy * (i - 2) : 0);
    px(ctx, C.white, x - i, wy);
    px(ctx, C.white, x + i, wy);
    px(ctx, "#9aa6ae", x - i, wy + 1);
    px(ctx, "#9aa6ae", x + i, wy + 1);
  }
  rect(ctx, C.white, x - 1, y, 3, 2);
}

// z de 3×3 celdas, a escala s, con sombra.
function zed(ctx, x, y, s, alpha) {
  ctx.globalAlpha = alpha;
  for (const [color, o] of [[C.ink, 1], [C.white, 0]]) {
    rect(ctx, color, x + o, y + o, 3 * s, s);
    rect(ctx, color, x + s + o, y + s + o, s, s);
    rect(ctx, color, x + o, y + 2 * s + o, 3 * s, s);
  }
  ctx.globalAlpha = 1;
}

// Nota musical de píxeles.
function note(ctx, x, y, color, alpha) {
  ctx.globalAlpha = alpha;
  rect(ctx, C.ink, x, y + 6, 4, 3);
  rect(ctx, C.ink, x + 3, y, 2, 8);
  rect(ctx, color, x, y + 6, 3, 2);
  rect(ctx, color, x + 3, y + 1, 1, 6);
  rect(ctx, color, x + 4, y + 1, 2, 1);
  ctx.globalAlpha = 1;
}

// Palmera: tronco curvo por segmentos y hojas en arco que se mecen.
// Devuelve la posición de la copa.
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
  return { x: cx, y: cy };
}

// ---------- Hospital ----------

function hospital(ctx, t) {
  const x = HX;
  const y = HY;
  const w = HW;
  const hh = SHORE - HY; // el edificio llega justo a la arena
  rect(ctx, C.ink, x - 1, y - 1, w + 2, hh + 1);
  rect(ctx, C.wall, x, y, w, hh);
  rect(ctx, C.wallShade, x + w - 8, y, 8, hh);
  rect(ctx, C.mintDark, x - 5, y - 7, w + 10, 7);
  rect(ctx, C.mint, x - 5, y - 7, w + 10, 4);
  // Torre central con la cruz (parpadea suave). Queda debajo del subtítulo.
  rect(ctx, C.ink, x + 43, y - 26, 34, 19);
  rect(ctx, C.wall, x + 44, y - 25, 32, 18);
  const glow = Math.floor(t * 2) % 2 === 0 ? C.red : "#e8505d";
  rect(ctx, glow, x + 57, y - 23, 6, 14);
  rect(ctx, glow, x + 53, y - 19, 14, 6);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 1 && col === 2) continue; // ahí va la puerta
      const wx = x + 8 + col * 22;
      const wy = y + 8 + row * 32;
      rect(ctx, C.ink, wx - 1, wy - 1, 16, 16);
      rect(ctx, C.glass, wx, wy, 14, 14);
      rect(ctx, C.glassLight, wx + 2, wy + 2, 3, 5);
      rect(ctx, C.mintDark, wx - 2, wy + 14, 18, 2);
    }
  }
  // Letrero de madera entre los dos pisos.
  rect(ctx, C.ink, x + 27, y + 24, 66, 13);
  rect(ctx, C.wood, x + 28, y + 25, 64, 11);
  rect(ctx, C.woodDark, x + 28, y + 35, 64, 1);
  ctx.font = "8px PixelFont, monospace";
  ctx.textBaseline = "top";
  ctx.fillStyle = C.ink;
  ctx.fillText("HOSPITAL", x + 29, y + 27);
  ctx.fillStyle = C.white;
  ctx.fillText("HOSPITAL", x + 28, y + 26);
  // Puerta doble, alero y escalones.
  rect(ctx, C.ink, x + 48, y + 46, 24, hh - 46);
  rect(ctx, C.glass, x + 50, y + 48, 9, hh - 48);
  rect(ctx, C.glass, x + 61, y + 48, 9, hh - 48);
  rect(ctx, C.glassLight, x + 52, y + 50, 2, 8);
  rect(ctx, C.glassLight, x + 63, y + 50, 2, 8);
  rect(ctx, C.red, x + 45, y + 42, 30, 4);
  for (let i = 0; i < 4; i++) rect(ctx, i % 2 ? C.wallShade : C.wall, x + 50 - i * 3, y + hh + i * 4, 20 + i * 6, 4);
}

// Banderitas de carnaval entre las dos puntas del techo.
function bunting(ctx, t) {
  const x1 = HX - 2;
  const x2 = HX + HW + 2;
  const y0 = HY - 6;
  const sag = 9;
  const colors = [C.red, C.yellow, C.blue, C.green];
  for (let x = x1; x <= x2; x++) {
    const k = (x - x1) / (x2 - x1);
    px(ctx, C.ink, x, y0 + Math.round(4 * sag * k * (1 - k)));
  }
  for (let i = 0, x = x1 + 6; x < x2 - 3; x += 8, i++) {
    const k = (x - x1) / (x2 - x1);
    const y = y0 + Math.round(4 * sag * k * (1 - k));
    const flutter = Math.round(Math.sin(t * 3 + i) * 1);
    const color = colors[i % colors.length];
    rect(ctx, color, x, y + 1, 5, 2);
    rect(ctx, color, x + 1 + flutter, y + 3, 3, 2);
    rect(ctx, color, x + 2 + flutter, y + 5, 1, 1);
  }
}

// ---------- Detalles costeños en la arena ----------

function sombrilla(ctx, cx, top) {
  const r = 17;
  rect(ctx, C.ink, cx - 1, top, 3, 44);
  rect(ctx, C.woodDark, cx, top, 1, 44);
  for (let dx = -r; dx <= r; dx++) {
    const hgt = Math.floor(Math.sqrt(r * r - dx * dx) * 0.7);
    const stripe = Math.floor((dx + r) / 6) % 2 === 0;
    rect(ctx, stripe ? C.red : C.white, cx + dx, top - hgt + 2, 1, hgt);
    px(ctx, C.ink, cx + dx, top - hgt + 1);
  }
  for (let dx = -r; dx <= r; dx += 6) rect(ctx, C.ink, cx + dx, top + 2, 1, 2);
  // Toalla a rayas bajo la sombrilla.
  for (let i = 0; i < 4; i++) rect(ctx, i % 2 ? C.white : C.blue, cx - 18 + i * 9, 202, 9, 7);
  rect(ctx, C.ink, cx - 19, 209, 38, 1);
}

function concha(ctx, x, y, color) {
  rect(ctx, color, x, y, 3, 2);
  px(ctx, C.white, x + 1, y);
  px(ctx, C.ink, x + 3, y + 1);
}

function estrella(ctx, x, y) {
  rect(ctx, "#f08a3c", x + 1, y, 1, 3);
  rect(ctx, "#f08a3c", x, y + 1, 3, 1);
}

function pico(ctx, t) {
  const x = 30;
  const y = 172;
  const beat = Math.sin(t * 8) > 0.3 ? 1 : 0;
  rect(ctx, C.ink, x - 1, y - 1, 42, 34);
  rect(ctx, C.red, x, y, 40, 32);
  rect(ctx, C.yellow, x, y, 40, 3);
  rect(ctx, C.blue, x, y + 29, 40, 3);
  rect(ctx, C.yellow, x + 17, y + 3, 6, 26);
  for (const cx of [x + 9, x + 31]) {
    disc(ctx, C.ink, cx, y + 16, 8 + beat);
    disc(ctx, C.yellow, cx, y + 16, 6 + beat);
    disc(ctx, C.blue, cx, y + 16, 3);
    px(ctx, C.white, cx - 2, y + 13);
  }
  // Corneta encima.
  rect(ctx, C.ink, x + 15, y - 7, 10, 7);
  rect(ctx, C.yellow, x + 16, y - 6, 8, 6);
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.45 + i / 3) % 1;
    note(ctx, x + 12 + i * 9 + Math.sin(t * 2 + i * 2) * 4, y - 10 - p * 44, [C.yellow, C.white, C.mint][i], 1 - p);
  }
}

function paciente(ctx, t) {
  const bx = 316; // izquierda de la silla
  const by = 206; // suelo
  const nod = Math.sin(t * 1.2);
  const hx = Math.round(nod); // la cabeza cabecea
  const hy = nod > 0.3 ? 1 : 0;
  // Silla Rimax: patas, asiento, respaldo con ranuras y brazos.
  rect(ctx, C.plasticShade, bx + 1, by - 8, 2, 8);
  rect(ctx, C.plasticShade, bx + 11, by - 8, 2, 8);
  rect(ctx, C.ink, bx - 2, by - 30, 6, 21);
  rect(ctx, C.plastic, bx - 1, by - 29, 4, 19);
  for (let i = 0; i < 4; i++) rect(ctx, C.plasticShade, bx - 1, by - 27 + i * 4, 4, 1);
  rect(ctx, C.ink, bx, by - 12, 16, 5);
  rect(ctx, C.plastic, bx + 1, by - 11, 14, 3);
  // Paciente: bata menta, piernas, sandalias.
  rect(ctx, C.mint, bx + 3, by - 27, 8, 15);
  rect(ctx, C.mintDark, bx + 3, by - 15, 8, 3);
  rect(ctx, C.mint, bx + 3, by - 15, 15, 4);
  rect(ctx, C.skin, bx + 17, by - 11, 4, 11);
  rect(ctx, C.ink, bx + 17, by - 1, 6, 2);
  rect(ctx, C.skin, bx + 8, by - 22, 5, 3); // brazo sobre el regazo
  // Cabeza y sombrero vueltiao (rayas negras y crema).
  const hdx = bx + 3 + hx;
  const hdy = by - 35 + hy;
  rect(ctx, C.skin, hdx, hdy, 7, 7);
  rect(ctx, C.ink, hdx + 3, hdy + 3, 3, 1); // ojo cerrado
  for (let i = 0; i < 7; i++) rect(ctx, i % 2 ? "#efe3c0" : C.ink, hdx - 3 + i * 2, hdy - 2, 2, 2);
  rect(ctx, C.ink, hdx - 3, hdy - 3, 14, 1);
  rect(ctx, C.ink, hdx - 3, hdy, 14, 1);
  for (let i = 0; i < 4; i++) rect(ctx, i % 2 ? "#efe3c0" : C.ink, hdx + 1 + i * 2, hdy - 7, 2, 5);
  rect(ctx, C.ink, hdx + 1, hdy - 8, 8, 1);
  // Zzz que suben y se desvanecen.
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.35 + i / 3) % 1;
    zed(ctx, bx + 12 + p * 10 + Math.sin(p * 7) * 2, by - 40 - p * 26, i % 2 ? 3 : 2, Math.min(1, 2 * (1 - p)));
  }
}

// ---------- Escena completa ----------

// drawMenuBackground dibuja la playa animada; t en segundos. La usan el
// menú y la configuración.
export function drawMenuBackground(ctx, t = 0) {
  ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = "alphabetic";
  C.sky.forEach((color, i) => rect(ctx, color, 0, (i * HORIZON) / 4, W, HORIZON / 4 + 1));
  // Sol con rayos que parpadean.
  const ray = Math.floor(t * 2) % 2 === 0 ? 4 : 6;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
    for (let k = 18; k < 18 + ray; k++) px(ctx, C.sunLight, 350 + dx * k, 52 + dy * k);
  }
  disc(ctx, C.sun, 350, 52, 15);
  disc(ctx, C.sunLight, 346, 47, 5);
  // Nubes que dan la vuelta, y gaviotas.
  const drift = (speed, offset) => ((t * speed + offset) % (W + 60)) - 40;
  cloud(ctx, drift(6, 20), 26);
  cloud(ctx, drift(4, 210), 66);
  cloud(ctx, drift(8, 330), 12);
  cloud(ctx, drift(3, 120), 100);
  gull(ctx, drift(14, 60), 40 + Math.sin(t) * 3, t, 0);
  gull(ctx, drift(11, 250), 86 + Math.sin(t * 0.8 + 2) * 3, t, 1);
  gull(ctx, drift(17, 340), 20 + Math.sin(t * 1.2 + 4) * 2, t, 2);
  // Mar con olas en filas que se desplazan a distinta velocidad.
  rect(ctx, C.sea, 0, HORIZON, W, SHORE - HORIZON);
  rect(ctx, C.seaDeep, 0, HORIZON, W, 4);
  for (let row = 0; row < 9; row++) {
    const wy = HORIZON + 6 + row * 4;
    for (let j = 0; j < 8; j++) {
      const wx = ((j * 53 + row * 17 + t * (6 + row * 1.5)) % (W + 20)) - 10;
      rect(ctx, C.seaLight, wx, wy + Math.round(Math.sin(t * 2 + j + row)), 8 + (row % 3) * 2, 1);
    }
  }
  // Espuma que sube y baja en la orilla.
  rect(ctx, C.sandWet, 0, SHORE, W, 3);
  for (let x = 0; x < W; x += 2) rect(ctx, C.foam, x, SHORE - 1 + Math.round(Math.sin(x * 0.07 + t * 2) * 1.5), 2, 2);
  // Arena con granitos fijos.
  rect(ctx, C.sand, 0, SHORE + 3, W, 41);
  for (let i = 0; i < 80; i++) rect(ctx, C.sandDark, (i * 53) % W, SHORE + 5 + ((i * 37) % 38), 2, 1);
  hospital(ctx, t);
  bunting(ctx, t);
  palm(ctx, 194, 198, 88, -0.5, t, 0);
  palm(ctx, 376, 200, 78, -1, t, 1.7);
  palm(ctx, 10, 212, 52, 0.6, t, 3.1);
  sombrilla(ctx, 122, 160);
  pico(ctx, t);
  paciente(ctx, t);
  concha(ctx, 86, 196, "#f1a7a0");
  concha(ctx, 162, 205, "#f4d9b0");
  concha(ctx, 250, 200, "#f1a7a0");
  concha(ctx, 292, 211, "#e8c7e0");
  estrella(ctx, 205, 192);
  estrella(ctx, 98, 210);
}

export function createMenuScene(_params, app) {
  let t = 0;
  let root = null;
  let buttons = [];
  let onKey = null;
  let offMusic = null;

  return {
    layout: { kind: "full", reserveW: 32, reserveH: 32, maxScale: 4 },
    mount(el) {
      root = el;
      const go = (name) => () => app.showScene(name);
      const items = [
        ["Iniciar", "game"],
        ["Simular caso de prueba", "scenario"],
        ["Configuración", "config"],
        ["Créditos", "credits"],
      ];
      buttons = items.map(([label, scene], i) =>
        h("button", {
          class: "btn btn-big",
          type: "button",
          onclick: go(scene),
          // El ratón mueve la selección igual que las flechas.
          onmouseenter: (e) => e.currentTarget.focus({ preventScroll: true }),
          dataset: { index: i },
        }, label),
      );
      const muteBtn = bindMusicButton(h("button", { class: "btn btn-music menu-mute", type: "button" }, "♪"), app.music);
      const hint = h("p", { class: "menu-hint", role: "status" }, "♪ Haz clic para la música");
      const syncHint = () => {
        hint.hidden = !app.music || app.music.played;
      };
      syncHint();
      offMusic = app.music?.subscribe(syncHint);

      el.append(
        h(
          "div",
          { class: "menu menu-main" },
          h("div", { class: "menu-top" }, h("h1", { class: "menu-title ui-box" }, HOSPITAL_NAME), h("p", { class: "menu-sub" }, SUBTITLE)),
          h("nav", { class: "menu-buttons", "aria-label": "Menú principal" }, buttons),
          muteBtn,
          hint,
        ),
      );
      buttons[0].focus();

      onKey = (e) => {
        const active = buttons.indexOf(document.activeElement);
        const next = menuNav(active, e.key, buttons.length);
        if (next !== null) {
          e.preventDefault();
          buttons[next].focus();
        } else if (e.key === "Enter" && document.activeElement?.tagName !== "BUTTON") {
          buttons[0].click();
        }
      };
      window.addEventListener("keydown", onKey);
    },
    unmount() {
      if (onKey) window.removeEventListener("keydown", onKey);
      onKey = null;
      offMusic?.();
      offMusic = null;
      root?.replaceChildren();
      root = null;
      buttons = [];
    },
    update(dt) {
      t += dt;
    },
    draw(ctx) {
      drawMenuBackground(ctx, t);
    },
  };
}
