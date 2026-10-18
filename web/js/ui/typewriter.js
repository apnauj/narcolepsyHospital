// Modelo puro del registro con texto que aparece letra por letra. Las
// líneas se escriben de una en una, en orden; las que esperan se ven
// cuando les toca. El Log (log.js) solo lo pinta.

export class Typewriter {
  // cps: letras por segundo. maxLines: líneas que se conservan.
  // rush: con más líneas que esto en espera, la actual se completa de
  // golpe para que el registro no se quede atrás de la acción.
  constructor({ cps = 60, maxLines = 40, rush = 3 } = {}) {
    this.cps = cps;
    this.maxLines = maxLines;
    this.rush = rush;
    this.lines = []; // { text, shown } ya empezadas o terminadas
    this.pending = []; // textos que aún no empiezan
    this.carry = 0; // fracción de letra acumulada entre ticks
  }

  push(text) {
    this.pending.push(String(text));
    if (!this.current()) this.startNext();
  }

  current() {
    const last = this.lines.at(-1);
    return last && last.shown < last.text.length ? last : null;
  }

  get typing() {
    return Boolean(this.current()) || this.pending.length > 0;
  }

  startNext() {
    if (this.pending.length === 0) return false;
    this.lines.push({ text: this.pending.shift(), shown: 0 });
    while (this.lines.length > this.maxLines) this.lines.shift();
    return true;
  }

  // tick avanza dt segundos. Devuelve true si cambió algo visible.
  tick(dt) {
    let changed = false;
    this.carry += dt * this.cps;
    while (this.carry >= 1 || (this.current() && this.pending.length > this.rush)) {
      const cur = this.current();
      if (!cur) {
        if (!this.startNext()) break;
        changed = true;
        continue;
      }
      if (this.pending.length > this.rush) {
        cur.shown = cur.text.length;
      } else {
        cur.shown += 1;
        this.carry -= 1;
      }
      changed = true;
    }
    if (!this.typing) this.carry = 0;
    return changed;
  }

  // Lo que se ve: el texto de cada línea hasta donde va.
  visible() {
    return this.lines.map((l) => l.text.slice(0, l.shown));
  }

  clear() {
    this.lines = [];
    this.pending = [];
    this.carry = 0;
  }
}
