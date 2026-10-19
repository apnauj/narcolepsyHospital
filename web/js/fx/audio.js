// Sonidos sintetizados con WebAudio, sin archivos: «bip» al despertar,
// ronquido suave y sirena de la camilla robot.
//
// Silenciado por defecto (volume = 0). Con volumen 0 ni siquiera se crea el
// AudioContext. El navegador solo deja sonar después de un gesto del
// usuario; como el juego se maneja con clics, el primer sonido intenta
// reanudar el contexto y, si no puede, no pasa nada.

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * @param {{ volume?: number, AudioCtx?: Function }} [opts]
 *   AudioCtx: constructor de AudioContext (los tests pasan uno falso).
 */
export function createAudio({ volume = 0, AudioCtx = globalThis.AudioContext ?? globalThis.webkitAudioContext } = {}) {
  let vol = clamp01(volume);
  let ctx = null;
  let master = null;
  let broken = false;

  function ensure() {
    if (vol <= 0 || broken || typeof AudioCtx !== "function") return null;
    if (!ctx) {
      try {
        ctx = new AudioCtx();
        master = ctx.createGain();
        master.gain.value = vol;
        master.connect(ctx.destination);
      } catch {
        broken = true;
        ctx = null;
        return null;
      }
    }
    if (ctx.state === "suspended") ctx.resume?.()?.catch?.(() => {});
    return ctx;
  }

  // Un tono con envolvente: sube rápido, se sostiene y se apaga.
  function tone(freq, dur, { type = "square", gain = 0.2, delay = 0, slideTo = 0, filter = 0 } = {}) {
    const ac = ensure();
    if (!ac) return false;
    try {
      const t0 = ac.currentTime + delay;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.02, dur / 4));
      g.gain.linearRampToValueAtTime(gain * 0.7, t0 + dur * 0.7);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      let node = osc;
      if (filter) {
        const f = ac.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = filter;
        osc.connect(f);
        node = f;
      }
      node.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
      return true;
    } catch {
      return false;
    }
  }

  return {
    get volume() {
      return vol;
    },
    /** true si hay un contexto de audio creado. */
    get active() {
      return Boolean(ctx);
    },
    setVolume(v) {
      vol = clamp01(v);
      if (master) master.gain.value = vol;
    },
    /** «Bip-bip» de monitor cuando alguien despierta. */
    beep() {
      return tone(880, 0.07, { gain: 0.15 }) && tone(1320, 0.09, { gain: 0.15, delay: 0.1 });
    },
    /** Ronquido suave: diente de sierra grave y filtrado que sube y baja. */
    snore() {
      return tone(70, 0.55, { type: "sawtooth", gain: 0.08, slideTo: 95, filter: 320 }) &&
        tone(95, 0.6, { type: "sawtooth", gain: 0.05, slideTo: 60, filter: 260, delay: 0.6 });
    },
    /** Sirena «uiu-uiu» de la camilla robot al recoger a alguien. */
    siren() {
      let ok = true;
      for (let i = 0; i < 2; i++) {
        ok = tone(620, 0.3, { type: "triangle", gain: 0.07, slideTo: 920, delay: i * 0.6 }) && ok;
        ok = tone(920, 0.3, { type: "triangle", gain: 0.07, slideTo: 620, delay: i * 0.6 + 0.3 }) && ok;
      }
      return ok;
    },
    dispose() {
      try {
        ctx?.close?.();
      } catch {
        /* nada que cerrar */
      }
      ctx = null;
      master = null;
    },
  };
}

// Un solo AudioContext para toda la página: cada partida nueva reutiliza el
// mismo (los navegadores limitan cuántos se pueden abrir) y solo le cambia
// el volumen.
let shared = null;

export function sharedAudio(volume = 0) {
  shared ??= createAudio({ volume });
  shared.setVolume(volume);
  return shared;
}
