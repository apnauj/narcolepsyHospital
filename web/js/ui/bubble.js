// Globo de diálogo estilo Pokémon, mínimo. Se dibuja en el canvas del mapa
// (coordenadas de pantalla). feature/gui-polish lo pulirá; la interfaz es
// new Bubble(text, x, y, opts), update(dt), draw(ctx) y done.

// wrapText parte el texto en líneas de hasta maxChars sin cortar palabras.
export function wrapText(text, maxChars = 22) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// pickPhrase elige una frase de data/phrases.json ("wake", "doctor"...).
export function pickPhrase(phrases, kind, rng = Math.random) {
  const list = phrases?.[kind] ?? [];
  if (list.length === 0) return "";
  return list[Math.floor(rng() * list.length) % list.length];
}

let phrasesPromise = null;

// loadPhrases lee data/phrases.json una sola vez; si falla, devuelve {}.
export function loadPhrases() {
  phrasesPromise ??= fetch("data/phrases.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return phrasesPromise;
}

const LINE_H = 9;
const PAD = 4;

export class Bubble {
  // x, y: punta del globo (sobre la cabeza de quien habla).
  constructor(text, x, y, { duration = 3, maxChars = 22, font = '8px "PixelFont", monospace' } = {}) {
    this.lines = wrapText(text, maxChars);
    this.x = x;
    this.y = y;
    this.duration = duration;
    this.font = font;
    this.time = 0;
  }

  get done() {
    return this.time >= this.duration;
  }

  update(dt) {
    this.time += dt;
  }

  draw(ctx) {
    if (this.done || this.lines.length === 0) return;
    ctx.save();
    ctx.font = this.font;
    ctx.textBaseline = "top";
    const textW = Math.max(...this.lines.map((l) => ctx.measureText(l).width));
    const w = Math.ceil(textW) + PAD * 2;
    const hgt = this.lines.length * LINE_H + PAD * 2 - 1;
    // Se mantiene dentro de la pantalla de 384×216.
    const maxX = (ctx.canvas?.width ?? 384) - w - 1;
    const left = Math.round(Math.max(1, Math.min(maxX, this.x - w / 2)));
    const top = Math.round(Math.max(1, this.y - hgt - 4));

    // Sombra dura, borde oscuro y caja blanca cálida.
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(left + 2, top + 2, w, hgt);
    ctx.fillStyle = "#2b2118";
    ctx.fillRect(left - 1, top - 1, w + 2, hgt + 2);
    ctx.fillStyle = "#fdf6e3";
    ctx.fillRect(left, top, w, hgt);
    // Colita hacia quien habla.
    const tipX = Math.round(Math.max(left + 3, Math.min(left + w - 4, this.x)));
    ctx.fillStyle = "#2b2118";
    ctx.fillRect(tipX - 2, top + hgt, 5, 2);
    ctx.fillRect(tipX - 1, top + hgt + 2, 3, 1);
    ctx.fillStyle = "#fdf6e3";
    ctx.fillRect(tipX - 1, top + hgt, 3, 1);

    ctx.fillStyle = "#2b2118";
    this.lines.forEach((line, i) => ctx.fillText(line, left + PAD, top + PAD + i * LINE_H));
    ctx.restore();
  }
}
