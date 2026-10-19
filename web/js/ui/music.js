// Música de fondo: un único HTMLAudioElement en bucle para toda la app.
//
// Los navegadores bloquean el autoplay: se intenta una vez al iniciar y, si
// no deja, se reintenta en el primer gesto del usuario (clic, tecla, toque).
// Mientras no haya sonado, `played` es false y el menú muestra su aviso.
// Nada aquí lanza: los fallos de carga o de play() solo dejan un warning.
// El Audio y el objetivo de eventos son inyectables para probarlo en Node.

export const MUSIC_SRC = "assets/audio/musica.mp3";
const GESTURES = ["pointerdown", "keydown", "click", "touchend"];

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * @param {{ src?: string, makeAudio?: () => any, volume?: number, muted?: boolean }} [opts]
 */
export function createMusic({ src = MUSIC_SRC, makeAudio = () => new Audio(), volume = 0.5, muted = false } = {}) {
  let vol = clamp01(volume);
  let mute = Boolean(muted);
  let played = false;
  let pending = false;
  let audio = null;
  let detach = null;
  const listeners = new Set();

  const notify = () => {
    for (const fn of [...listeners]) {
      try {
        fn(api);
      } catch (err) {
        console.warn("música: error en un oyente", err);
      }
    }
  };

  // El elemento se crea una sola vez y vive mientras viva la página: así la
  // música no se reinicia al cambiar de escena.
  function ensure() {
    if (audio) return audio;
    try {
      audio = makeAudio();
      audio.src = src;
      audio.loop = true;
      audio.preload = "auto";
      audio.addEventListener?.("error", () => console.warn("música: no se pudo cargar", src));
      apply();
    } catch (err) {
      console.warn("música: no se pudo crear el audio", err);
      audio = null;
    }
    return audio;
  }

  function apply() {
    if (!audio) return;
    try {
      audio.volume = vol;
      audio.muted = mute;
    } catch (err) {
      console.warn("música: no se pudo ajustar el volumen", err);
    }
  }

  // start intenta reproducir; si ya suena no hace nada (no reinicia).
  // `quiet` evita el warning del bloqueo de autoplay, que es lo esperado.
  async function start({ quiet = false } = {}) {
    if (played || pending) return played;
    const a = ensure();
    if (!a) return false;
    pending = true;
    try {
      await a.play();
      played = true;
      detach?.();
      notify();
    } catch (err) {
      if (!(quiet && err?.name === "NotAllowedError")) console.warn("música: play() falló", err?.message ?? err);
    } finally {
      pending = false;
    }
    return played;
  }

  // Reintenta en cada gesto hasta que suene; después suelta los oyentes.
  function attachGestures(target = globalThis) {
    detach?.();
    if (!target?.addEventListener) return;
    const onGesture = () => {
      start();
    };
    for (const type of GESTURES) target.addEventListener(type, onGesture, { passive: true });
    detach = () => {
      for (const type of GESTURES) target.removeEventListener?.(type, onGesture);
      detach = null;
    };
  }

  const api = {
    get played() {
      return played;
    },
    get muted() {
      return mute;
    },
    get volume() {
      return vol;
    },
    get audio() {
      return audio;
    },
    start,
    attachGestures,
    setVolume(v) {
      vol = clamp01(v);
      apply();
      notify();
    },
    setMuted(m) {
      mute = Boolean(m);
      apply();
      notify();
    },
    toggleMute() {
      api.setMuted(!mute);
      return mute;
    },
    // fn(music) se llama al sonar por primera vez y al cambiar mute o volumen.
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  ensure();
  return api;
}

let shared = null;

// initMusic crea la música global (una vez), intenta arrancar y espera el
// primer gesto. Sin Audio (Node, navegador raro) devuelve una música inerte.
export function initMusic(opts = {}) {
  if (shared) return shared;
  shared = createMusic(opts);
  shared.attachGestures(globalThis);
  shared.start({ quiet: true });
  return shared;
}

export const getMusic = () => shared;

// Texto del botón de silenciar: ♪ con sonido, ✕ silenciada.
export const musicLabel = (muted) => (muted ? "✕" : "♪");

// Engancha un botón existente a la música: clic alterna el silencio y el
// texto sigue al estado. Pensado para el menú y la toolbar del juego.
export function bindMusicButton(btn, music = shared) {
  if (!btn) return btn;
  const paint = () => {
    const muted = music?.muted ?? true;
    btn.textContent = musicLabel(muted);
    btn.classList.toggle("muted", muted);
    btn.setAttribute("aria-pressed", String(!muted));
    const text = muted ? "Activar la música" : "Silenciar la música";
    btn.setAttribute("aria-label", text);
    btn.title = text;
  };
  btn.addEventListener("click", () => {
    if (!music) return;
    // Si aún no suena, el mismo clic la arranca (es un gesto válido).
    music.start();
    music.toggleMute();
  });
  paint();
  let seen = false;
  const off = music?.subscribe(() => {
    // El botón se reconstruye al cambiar de escena: se suelta el oyente.
    if (btn.isConnected) seen = true;
    else if (seen) return off?.();
    paint();
  });
  return btn;
}
