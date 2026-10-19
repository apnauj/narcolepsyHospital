// Efectos y vida del mapa (feature/gui-polish).
//
//   const fx = createFx(world, { volume, phrases, rng })
//   fx.onEvents(events, snapshot, director)   // cada Result de la API
//   fx.update(dt, director)                   // dt ya con pausa y velocidad
//   fx.drawWorldFx(ctx, camera)               // después de drawWorld
//   fx.drawEntityFx(ctx, camera, director)    // después de director.draw
//
// Qué hace:
//   - «Zzz» que flotan sobre los pacientes dormidos (anim sleep/stretcher).
//   - «!» que salta al empezar un ataque y cada tanto mientras flags.alert.
//   - Chispitas y «bip» al despertar.
//   - Decoración animada (decor.js): ventiladores, TV, monitores, cargadores
//     y picó, cuyas notas musicales salen como partículas.
//   - Sirena giratoria sobre la camilla robot mientras lleva a alguien.
//   - Frases: lo que alcanza a decir un paciente antes de dormirse, «¡Ombe,
//     otra vez!» desde su cuarto ataque, y la respuesta del doctor que lo
//     atendía cuando despierta.
//   - Sonido opcional (audio.js), silenciado por defecto.
//
// No cambia nada del director ni de la lógica: lee entidades (kind, id, x,
// y, anim, flags, carrying, state) y usa director.say / director.bubbles
// para los globos. Detecta los cambios de anim entre cuadros, así que los
// efectos salen cuando la animación de verdad empieza, no cuando llega el
// evento.

import { Particles, bounceHeight, fading, wobbleX, zGlyphFor } from "./particles.js";
import { animatedDecor, dockedPads, drawAnimatedDecor, occupiedRooms, picoBeat } from "./decor.js";
import { FX_COLORS as C, drawGlyph, drawOutlinedGlyph, glyphSize, rect } from "./pixel.js";
import { sharedAudio } from "./audio.js";
import { loadPhrases, pickPhrase } from "../ui/bubble.js";
import { TILE_SIZE, visibleTiles } from "../world/index.js";

export { ANIMATED_DECOR, animatedDecor, occupiedRooms, dockedPads, isAnimating } from "./decor.js";
export { Particles } from "./particles.js";
export { createAudio, sharedAudio } from "./audio.js";

/** Cada cuánto sale una «z» de un paciente dormido. */
export const Z_EVERY = 0.9;
/** Cada cuánto vuelve a saltar el «!» mientras dura la alerta. */
export const ALERT_EVERY = 1.3;
/** Probabilidad de que el paciente diga algo al empezar el ataque. */
export const ATTACK_TALK = 0.45;
/** Desde el ataque número REPEAT_ATTACKS + 1 de la sesión: «¡Ombe, otra vez!». */
export const REPEAT_ATTACKS = 3;
export const AGAIN_TEXT = "¡Ombe, otra vez!";
/** Segundos que espera el doctor después de que el paciente termina de hablar. */
export const REPLY_DELAY = 1;
/** Cuánto se espera a que aparezca el globo del paciente antes de olvidar la respuesta. */
export const REPLY_TIMEOUT = 20;
/** Cuánto vale una frase de ataque pendiente si la animación no empieza. */
export const LINE_TIMEOUT = 8;
/** Mínimo entre ronquidos. */
export const SNORE_EVERY = 6;
/** Altura del «!» sobre el centro de la entidad. */
export const BANG_DY = -15;
/** Altura de la sirena: 6 px = medio cuadrito de 12. */
export const SIREN_DY = -6;

const NOTE_COLORS = [C.red, C.sun, C.blue, C.leaf];
const S = TILE_SIZE;

/** true para las anims de paciente dormido. */
export function isAsleepAnim(anim) {
  return anim === "sleep" || anim === "stretcher";
}

/** Camillas robot que llevan a alguien: las que muestran la sirena. */
export function sirenRobots(entities) {
  return (entities ?? []).filter((e) => e.kind === "robot" && Boolean(e.carrying));
}

/** Entidades del director (getter `entities` o el mapa byId). */
export function entitiesOf(director) {
  if (!director) return [];
  const list = director.entities ?? (director.byId ? [...director.byId.values()] : []);
  return Array.isArray(list) ? list : [...list];
}

function bubbleOf(director, id) {
  return director?.bubbles?.find?.((b) => b.id === id)?.bubble ?? null;
}

/**
 * @param {World} world
 * @param {{ rng?: () => number, phrases?: object, volume?: number, audio?: object, director?: object }} [opts]
 */
export function createFx(world, { rng = Math.random, phrases = null, volume = 0, audio = null, director = null } = {}) {
  const particles = new Particles();
  const decor = animatedDecor(world);
  const picos = decor.filter((d) => d.kind === "pico");
  const sound = audio ?? sharedAudio(volume);
  /** Estado por entidad: anim anterior, relojes y frase pendiente. */
  const tracked = new Map();
  /** Ataques por paciente en esta sesión. */
  const attacks = new Map();
  /** Respuestas de doctor pendientes. */
  let replies = [];
  let lines = phrases;
  if (!lines) loadPhrases().then((p) => (lines ??= p), () => {});

  let snapshot = null;
  let lastDirector = director;
  let lastCamera = null;
  let t = 0;
  let snoreClock = SNORE_EVERY / 2;
  let beatSeen = -1;
  let notesEmitted = 0;

  const track = (id) => {
    let st = tracked.get(id);
    if (!st) {
      st = { prevAnim: undefined, z: 0.35, alert: 0, carrying: undefined, line: null, lineAge: 0 };
      tracked.set(id, st);
    }
    return st;
  };

  // Hace hablar a una entidad con el globo del director. Devuelve el Bubble.
  function say(d, e, text) {
    if (!text || !e || typeof d?.say !== "function") return null;
    d.say(e, text);
    return bubbleOf(d, e.id);
  }

  // ---------- Emisores ----------

  function emitZ(e) {
    particles.emit({
      kind: "z",
      x: e.x + 3,
      y: e.y - 9,
      vx: 2 + rng() * 2,
      vy: -8,
      life: 2.2,
      wobble: 1.5,
      phase: rng() * 6.28,
      color: C.white,
    });
  }

  function emitBang(e, big) {
    particles.emit({ kind: "bang", anchor: e.id, dy: BANG_DY, life: big ? 0.9 : 0.75, color: C.red });
  }

  function emitSparks(e) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng() * 0.5;
      particles.emit({
        kind: "spark",
        x: e.x + Math.cos(a) * 5,
        y: e.y - 8 + Math.sin(a) * 3,
        vx: Math.cos(a) * 14,
        vy: -12 + Math.sin(a) * 6,
        life: 0.5,
        color: C.sun,
      });
    }
  }

  function emitNote(pico) {
    particles.emit({
      kind: rng() < 0.5 ? "note" : "notes",
      x: pico.tx * S + 8 + (rng() - 0.5) * 6,
      y: pico.ty * S - 1,
      vx: (rng() - 0.5) * 6,
      vy: -10,
      life: 2,
      wobble: 2,
      phase: rng() * 6.28,
      color: NOTE_COLORS[notesEmitted++ % NOTE_COLORS.length],
    });
  }

  // ---------- Por entidad ----------

  function patientFx(d, e, st, dt) {
    const asleep = isAsleepAnim(e.anim);
    if (e.anim === "attack" && st.prevAnim !== "attack") {
      emitBang(e, true);
      st.alert = ALERT_EVERY;
      if (st.line) {
        say(d, e, st.line);
        st.line = null;
      }
    }
    if (e.anim === "wake" && st.prevAnim !== "wake") {
      emitSparks(e);
      sound.beep?.();
    }
    if (asleep) {
      st.z -= dt;
      if (st.z <= 0) {
        emitZ(e);
        st.z = Z_EVERY;
      }
    } else {
      st.z = 0.35;
    }
    if (e.flags?.alert && asleep) {
      st.alert -= dt;
      if (st.alert <= 0) {
        emitBang(e, false);
        st.alert = ALERT_EVERY;
      }
    } else if (e.anim !== "attack") {
      st.alert = 0;
    }
    if (st.line) {
      st.lineAge += dt;
      if (st.lineAge > LINE_TIMEOUT) st.line = null;
    }
  }

  // El doctor responde cuando el paciente terminó de hablar (y lo leímos).
  function updateReplies(d, dt) {
    for (const r of replies) {
      r.age += dt;
      const pb = bubbleOf(d, r.patient);
      if (!r.heard) {
        if (pb && pb !== r.before) r.heard = true;
        else if (r.age > REPLY_TIMEOUT) r.drop = true;
        continue;
      }
      if (pb?.typing) continue;
      r.wait += dt;
      if (pb && !pb.done && r.wait < REPLY_DELAY) continue;
      pb?.close?.();
      const doc = d?.entity?.(r.doctor) ?? entitiesOf(d).find((e) => e.id === r.doctor);
      const b = say(d, doc, pickPhrase(lines, "doctor", rng));
      if (b) b.accent = C.leaf;
      r.drop = true;
    }
    replies = replies.filter((r) => !r.drop);
  }

  function visible(e) {
    const cam = lastCamera;
    if (!cam?.toScreen) return true;
    const p = cam.toScreen(e.x, e.y);
    return p.x >= -8 && p.y >= -8 && p.x <= (cam.viewW ?? 384) + 8 && p.y <= (cam.viewH ?? 216) + 8;
  }

  // ---------- Dibujo ----------

  function drawParticle(ctx, p, d) {
    // Al final de su vida parpadea en vez de hacerse transparente.
    if (fading(p) && Math.floor(p.age * 16) % 2 === 1) return;
    switch (p.kind) {
      case "z": {
        const g = zGlyphFor(p);
        const { w, h } = glyphSize(g);
        drawOutlinedGlyph(ctx, g, Math.round(p.x + wobbleX(p) - w / 2), Math.round(p.y - h), p.color, C.blue);
        break;
      }
      case "bang": {
        const e = d?.entity?.(p.anchor) ?? entitiesOf(d).find((x) => x.id === p.anchor);
        if (!e) return;
        const hop = bounceHeight(p.age, p.life * 0.8);
        const { w, h } = glyphSize("bang");
        drawOutlinedGlyph(ctx, "bang", Math.round(e.x) - Math.floor(w / 2), Math.round(e.y) + p.dy - h - hop, p.color, C.ink);
        break;
      }
      case "note":
      case "notes": {
        const { w, h } = glyphSize(p.kind);
        drawOutlinedGlyph(ctx, p.kind, Math.round(p.x + wobbleX(p) - w / 2), Math.round(p.y - h), p.color, C.ink);
        break;
      }
      default:
        drawGlyph(ctx, "spark", Math.round(p.x) - 1, Math.round(p.y) - 1, p.color);
    }
  }

  // Sirena de 3×2 sobre la camilla robot: la luz gira de izquierda a derecha
  // y alterna rojo y azul, con un rayito hacia donde apunta.
  function drawSiren(ctx, e) {
    const x = Math.round(e.x);
    const y = Math.round(e.y) + SIREN_DY;
    const phase = Math.floor(t * 8) % 4;
    const color = phase < 2 ? C.red : C.blue;
    rect(ctx, C.ink, x - 2, y - 1, 5, 1);
    rect(ctx, C.ink, x - 2, y - 4, 5, 3);
    rect(ctx, color, x - 1, y - 3, 3, 2);
    rect(ctx, C.white, x - 1 + [0, 1, 2, 1][phase], y - 3, 1, 1);
    ctx.save();
    ctx.globalAlpha = 0.8;
    if (phase === 0) rect(ctx, color, x - 5, y - 3, 2, 1);
    else if (phase === 2) rect(ctx, color, x + 4, y - 3, 2, 1);
    else rect(ctx, color, x, y - 7, 1, 2);
    ctx.restore();
  }

  function worldTransform(ctx, camera) {
    const z = camera?.zoom || 1;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(-(camera?.offsetX ?? 0), -(camera?.offsetY ?? 0));
    ctx.scale(z, z);
  }

  const fx = {
    /** Sistema de partículas (lo leen los tests). */
    particles,
    /** Decor animados del mundo. */
    decor,

    /** Reloj de los efectos, en segundos. */
    get time() {
      return t;
    },

    /** Respuestas de doctor pendientes (para tests). */
    get pendingReplies() {
      return replies.length;
    },

    /** Ataques que lleva un paciente en la sesión. */
    attacksOf(id) {
      return attacks.get(id) ?? 0;
    },

    /** Frase pendiente de un paciente (la dice al empezar la animación). */
    pendingLine(id) {
      return tracked.get(id)?.line ?? null;
    },

    onEvents(events, snap, d) {
      if (d) lastDirector = d;
      if (snap) snapshot = snap;
      for (const ev of events ?? []) {
        if (ev.type === "attackStarted" && ev.patient) {
          const n = (attacks.get(ev.patient) ?? 0) + 1;
          attacks.set(ev.patient, n);
          let line = "";
          if (n > REPEAT_ATTACKS) line = pickPhrase(lines, "again", rng) || AGAIN_TEXT;
          else if (rng() < ATTACK_TALK) line = pickPhrase(lines, "attack", rng);
          if (line) {
            const st = track(ev.patient);
            st.line = line;
            st.lineAge = 0;
          }
        } else if (ev.type === "patientWoke" && ev.patient && ev.staff) {
          const kind = snap?.staff?.find((s) => s.id === ev.staff)?.kind;
          if (kind === "doctor") {
            // Un globo viejo del paciente (p. ej. su frase de ataque) no cuenta;
            // el de despertar puede existir ya si el director lo creó en apply
            // (todavía con time 0).
            const old = bubbleOf(lastDirector, ev.patient);
            const before = old && old.time > 0 ? old : null;
            replies.push({ patient: ev.patient, doctor: ev.staff, age: 0, wait: 0, heard: false, before });
          }
        }
      }
    },

    update(dt, d = lastDirector) {
      if (!(dt > 0)) return;
      if (d) lastDirector = d;
      d = lastDirector;
      t += dt;

      const seen = new Set();
      let sleeperOnScreen = false;
      for (const e of entitiesOf(d)) {
        seen.add(e.id);
        const st = track(e.id);
        if (e.kind === "patient") {
          patientFx(d, e, st, dt);
          if (isAsleepAnim(e.anim) && visible(e)) sleeperOnScreen = true;
        } else if (e.kind === "robot") {
          if (e.carrying && !st.carrying) sound.siren?.();
        }
        st.carrying = e.carrying;
        st.prevAnim = e.anim;
      }
      // Lo que ya no existe se olvida (salvo frases recién encoladas).
      for (const [id, st] of tracked) if (!seen.has(id) && !st.line) tracked.delete(id);
      particles.dropOrphans((id) => seen.has(id));

      // Notas del picó: una cada dos golpes.
      const { beat } = picoBeat(t);
      if (beat !== beatSeen) {
        beatSeen = beat;
        if (beat % 2 === 0) for (const p of picos) emitNote(p);
      }

      particles.update(dt);

      snoreClock -= dt;
      if (snoreClock <= 0) {
        snoreClock = SNORE_EVERY;
        if (sleeperOnScreen) sound.snore?.();
      }

      updateReplies(d, dt);
    },

    drawWorldFx(ctx, camera) {
      if (!camera) return;
      lastCamera = camera;
      if (decor.length === 0) return;
      const view = visibleTiles(world, camera);
      const state = { occupied: occupiedRooms(snapshot, lastDirector), docked: dockedPads(entitiesOf(lastDirector)) };
      worldTransform(ctx, camera);
      for (const item of decor) {
        if (item.tx + item.w - 1 < view.tx0 || item.tx > view.tx1 || item.ty + item.h - 1 < view.ty0 || item.ty > view.ty1) continue;
        drawAnimatedDecor(ctx, item, t, state);
      }
      ctx.restore();
    },

    drawEntityFx(ctx, camera, d = lastDirector) {
      if (!camera) return;
      lastCamera = camera;
      if (d) lastDirector = d;
      worldTransform(ctx, camera);
      for (const r of sirenRobots(entitiesOf(lastDirector))) drawSiren(ctx, r);
      for (const p of particles.list) drawParticle(ctx, p, lastDirector);
      ctx.restore();
      // Los globos del director, otra vez encima: ningún efecto los tapa.
      for (const b of lastDirector?.bubbles ?? []) b.bubble?.draw?.(ctx);
    },
  };
  return fx;
}
