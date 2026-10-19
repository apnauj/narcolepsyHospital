// Globo de diálogo estilo Pokémon. Se dibuja en el canvas del mapa, en
// coordenadas de pantalla (384×216).
//
// Interfaz (la usan director.js y game.js):
//   new Bubble(text, x, y, opts)   (x, y) = punta del globo, sobre quien habla
//   update(dt), draw(ctx), done
// Extras compatibles: typing, shown, close(), accent, y las funciones puras
// wrapText, bubbleDuration y layoutBubble (las prueban los tests).
//
// Aspecto: caja blanca cálida con borde doble (tinta por fuera, una línea de
// color por dentro), esquinas recortadas, sombra dura, texto que aparece
// letra por letra y una flechita hacia quien habla. Si no cabe encima de la
// cabeza, se pone debajo de los pies; nunca se sale de la pantalla.

/** Colores del globo (paleta Caribe de world/render.js y ui.css). */
export const BUBBLE_COLORS = Object.freeze({
  ink: "#2b2118",
  paper: "#fdf6e3",
  accent: "#2f80c2", // azul mar; el doctor responde con verde
  shadow: "rgba(0,0,0,0.35)",
});

/** Letras por segundo del efecto de máquina de escribir. */
export const TYPE_CPS = 30;
/** Alto de cada línea de texto, en px. */
export const LINE_H = 9;
/** Grosor del borde doble: tinta, papel y línea de color. */
export const BORDER = 3;
/** Espacio entre el borde y el texto. */
export const PAD = 3;
/** Alto de la flechita. */
export const TAIL = 4;
/** Margen mínimo con el borde de la pantalla. */
export const MARGIN = 1;
/** Distancia de la punta a donde empieza el globo cuando va debajo (cuerpo de 16 px). */
export const BELOW_GAP = 18;

const DEFAULT_FONT = '8px "PixelFont", monospace';
const VIEW_W = 384;
const VIEW_H = 216;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const charCount = (s) => [...String(s)].length;

// wrapText parte el texto en líneas de hasta maxChars sin cortar palabras;
// una palabra más larga que la línea sí se parte.
export function wrapText(text, maxChars = 22) {
  const lines = [];
  let line = "";
  for (let word of String(text).split(/\s+/).filter(Boolean)) {
    while (charCount(word) > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      const chars = [...word];
      lines.push(chars.slice(0, maxChars).join(""));
      word = chars.slice(maxChars).join("");
    }
    if (!word) continue;
    if (!line) line = word;
    else if (charCount(line) + 1 + charCount(word) <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Segundos que dura un globo: lo que tarda en escribirse más un rato para
 * leerlo, que crece con la longitud (entre 2 y 5 s).
 */
export function bubbleDuration(text, { cps = TYPE_CPS } = {}) {
  const n = charCount(text);
  return n / cps + clamp(1.6 + n * 0.05, 2, 5);
}

/**
 * Caja del globo en pantalla. Puro: recibe el ancho del texto ya medido.
 * @param {{ textW: number, lines: number, x: number, y: number, viewW?: number, viewH?: number }} p
 * @returns {{ left, top, w, h, tipX, below, tail }} below = true si va debajo de
 *   quien habla; tail = false si la flechita no cabe (quien habla está fuera de vista).
 */
export function layoutBubble({ textW, lines, x, y, viewW = VIEW_W, viewH = VIEW_H }) {
  const w = Math.min(viewW - 2 * MARGIN, Math.ceil(textW) + 2 * (BORDER + PAD));
  const h = Math.min(viewH - 2 * MARGIN, Math.max(1, lines) * LINE_H - 1 + 2 * (BORDER + PAD));
  const px = Math.round(x);
  const py = Math.round(y);

  // Encima de la cabeza; si no cabe, debajo de los pies.
  let top = py - TAIL - h;
  let below = false;
  if (top < MARGIN) {
    const under = py + BELOW_GAP + TAIL;
    if (under + h <= viewH - MARGIN) {
      top = under;
      below = true;
    }
  }
  top = clamp(top, MARGIN, viewH - MARGIN - h);
  const left = clamp(px - Math.floor(w / 2), MARGIN, viewW - MARGIN - w);
  // La flechita apunta a quien habla sin salirse de las esquinas recortadas.
  const tipX = clamp(px, left + BORDER + 3, left + w - BORDER - 4);
  const tail = below ? top - TAIL >= 0 : top + h + TAIL <= viewH;
  return { left, top, w, h, tipX, below, tail };
}

export class Bubble {
  /**
   * @param {string} text
   * @param {number} x punta del globo (pantalla)
   * @param {number} y
   * @param {{ duration?: number, maxChars?: number, font?: string, cps?: number, accent?: string }} [opts]
   *   Sin duration, se calcula con bubbleDuration según la longitud.
   */
  constructor(text, x, y, { duration, maxChars = 22, font = DEFAULT_FONT, cps = TYPE_CPS, accent = BUBBLE_COLORS.accent } = {}) {
    this.text = String(text ?? "");
    this.lines = wrapText(this.text, maxChars);
    this.x = x;
    this.y = y;
    this.cps = cps;
    this.duration = Number.isFinite(duration) ? duration : bubbleDuration(this.text, { cps });
    this.font = font;
    this.accent = accent;
    this.time = 0;
    this.total = this.lines.reduce((n, l) => n + charCount(l), 0);
  }

  get done() {
    return this.time >= this.duration;
  }

  /** Letras visibles hasta ahora (sin contar los espacios entre líneas). */
  get shown() {
    return Math.min(this.total, Math.floor(this.time * this.cps + 1e-9));
  }

  /** true mientras el texto todavía se está escribiendo. */
  get typing() {
    return !this.done && this.shown < this.total;
  }

  update(dt) {
    if (Number.isFinite(dt) && dt > 0) this.time += dt;
  }

  /** Termina el globo ya (p. ej. cuando otro personaje responde). */
  close() {
    this.time = this.duration;
  }

  /** Líneas tal como se ven ahora, cortadas donde va la escritura. */
  visibleLines() {
    let left = this.shown;
    const out = [];
    for (const line of this.lines) {
      if (left <= 0) break;
      const chars = [...line];
      out.push(chars.slice(0, left).join(""));
      left -= chars.length;
    }
    return out;
  }

  draw(ctx) {
    if (this.done || this.lines.length === 0) return;
    ctx.save();
    ctx.font = this.font;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    // La caja se mide con el texto completo para que no crezca al escribir.
    const textW = Math.max(...this.lines.map((l) => ctx.measureText(l).width));
    const box = layoutBubble({
      textW,
      lines: this.lines.length,
      x: this.x,
      y: this.y,
      viewW: ctx.canvas?.width ?? VIEW_W,
      viewH: ctx.canvas?.height ?? VIEW_H,
    });
    drawFrame(ctx, box, this.accent);

    ctx.fillStyle = BUBBLE_COLORS.ink;
    const tx = box.left + BORDER + PAD;
    const ty = box.top + BORDER + PAD;
    this.visibleLines().forEach((line, i) => ctx.fillText(line, tx, ty + i * LINE_H));

    // Ya escrito: el triangulito de «sigue» parpadea en la esquina.
    if (!this.typing && Math.floor(this.time * 3) % 2 === 0) {
      const ax = box.left + box.w - BORDER - 5;
      const ay = box.top + box.h - BORDER - 3;
      ctx.fillStyle = this.accent;
      ctx.fillRect(ax, ay, 3, 1);
      ctx.fillRect(ax + 1, ay + 1, 1, 1);
    }
    ctx.restore();
  }
}

// Marco del globo: sombra, borde doble con esquinas recortadas y flechita.
function drawFrame(ctx, { left: x, top: y, w, h, tipX, below, tail }, accent) {
  const C = BUBBLE_COLORS;
  const fill = (color, rx, ry, rw, rh) => {
    ctx.fillStyle = color;
    ctx.fillRect(rx, ry, rw, rh);
  };
  const chamfer = (color, inset) => {
    fill(color, x + inset + 1, y + inset, w - 2 * inset - 2, h - 2 * inset);
    fill(color, x + inset, y + inset + 1, w - 2 * inset, h - 2 * inset - 2);
  };

  // Sombra dura abajo a la derecha.
  fill(C.shadow, x + 2, y + h, w - 1, 1);
  fill(C.shadow, x + w, y + 2, 1, h - 1);

  chamfer(C.ink, 0); // borde de tinta
  chamfer(C.paper, 1); // papel
  fill(accent, x + 2, y + 2, w - 4, h - 4); // línea de color
  fill(C.paper, x + 3, y + 3, w - 6, h - 6); // interior

  if (!tail) return;
  // Flechita: triángulo de TAIL filas que se angosta hacia quien habla; la
  // última fila es solo tinta (la punta).
  for (let i = 0; i < TAIL; i++) {
    const half = TAIL - 1 - i;
    const ry = below ? y - 1 - i : y + h + i;
    fill(C.ink, tipX - half - 1, ry, 2 * half + 3, 1);
    if (half >= 1) fill(C.paper, tipX - half, ry, 2 * half + 1, 1);
  }
  // Abre el borde donde nace la flechita.
  fill(C.paper, tipX - (TAIL - 1), below ? y : y + h - 3, 2 * TAIL - 1, 3);
}

// pickPhrase elige una frase de data/phrases.json ("wake", "doctor",
// "attack"...). No repite seguida la misma frase de una lista: recuerda la
// última por objeto de frases y clase. Llama a rng una sola vez.
const lastPick = new WeakMap(); // phrases -> Map(kind -> índice)

export function pickPhrase(phrases, kind, rng = Math.random) {
  const list = phrases?.[kind];
  if (!Array.isArray(list) || list.length === 0) return "";
  const n = list.length;
  let memo = lastPick.get(phrases);
  if (!memo) lastPick.set(phrases, (memo = new Map()));
  const last = memo.get(kind);
  let i;
  if (n > 1 && Number.isInteger(last) && last < n) {
    // Elige entre las otras n-1 y se salta la última.
    i = Math.floor(rng() * (n - 1)) % (n - 1);
    if (i >= last) i += 1;
  } else {
    i = Math.floor(rng() * n) % n;
  }
  memo.set(kind, i);
  return list[i];
}

let phrasesPromise = null;

// loadPhrases lee data/phrases.json una sola vez; si falla, devuelve {}.
export function loadPhrases() {
  phrasesPromise ??= fetch("data/phrases.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return phrasesPromise;
}
