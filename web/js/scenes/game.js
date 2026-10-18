// Escena de juego (modo libre, «Iniciar») y base de la escena del caso de
// prueba (scenario.js usa createPlayScene con mode "scenario").
//
// Layout: mapa (canvas 384×216 escalado) + panel derecho (indicadores,
// colas, ficha) + barra de acciones + registro.
//
// PUNTOS DE CONEXIÓN para feature/gui-integration (buscar «CONEXIÓN»):
//   params.director   Director ya creado (contrato, sección 5).
//   params.world, params.camera, params.renderer, params.drawWorld
//                     Mundo, cámara, renderer (SquareRenderer...) y la
//                     función drawWorld(ctx, world, camera) de world/.
//   params.build(snapshot, config) -> Promise<{world, camera, director, renderer, drawWorld}>
//                     Opcional: se llama tras reset/scenarioStart, cuando ya
//                     se sabe cuántas habitaciones hay. Lo que devuelva
//                     reemplaza a lo de arriba.
// Con eso la escena llama sola a director.sync, apply, update, draw, pick y
// locationOf. Sin director dibuja el mundo (si hay) o un mapa provisional.
import * as api from "../api.js";
import { h } from "../ui/dom.js";
import { describeError, describeEvent, describeNotice } from "../ui/describe.js";
import {
  cardInfo,
  chooseAttackTarget,
  chooseWakeTarget,
  findPatient,
  formatQueries,
  locationIdByName,
  pickHallwayLocation,
  toolbarState,
} from "../ui/model.js";
import { SPEEDS } from "../ui/settings.js";
import { QueuePanel } from "../ui/queuePanel.js";
import { Indicators } from "../ui/indicators.js";
import { Toolbar } from "../ui/toolbar.js";
import { Card } from "../ui/card.js";
import { Log } from "../ui/log.js";
import { QueriesPanel } from "../ui/queries.js";
import { Bubble, loadPhrases, pickPhrase } from "../ui/bubble.js";
import { drawPlaceholder, pickPlaceholder, placeholderLayout } from "./placeholder.js";
import { HOSPITAL_NAME } from "./menu.js";

const SCREEN_W = 384;
const SCREEN_H = 216;

export function createGameScene(params, app) {
  return createPlayScene(params, app, { mode: "free" });
}

export function createPlayScene(params = {}, app, { mode = "free" } = {}) {
  // Todo lo que viene de la integración. Sin nada de esto, mapa provisional.
  const stage = {
    director: params.director ?? null,
    world: params.world ?? null,
    camera: params.camera ?? null,
    renderer: params.renderer ?? null,
    drawWorld: params.drawWorld ?? null,
  };

  const state = {
    snapshot: null,
    locations: [],
    selection: null, // { kind, id } | null
    paused: false,
    speed: SPEEDS.includes(app.config.speed) ? app.config.speed : 1,
    busy: false,
    done: false,
    step: null,
    step5Notices: [],
    scenarioNotices: [],
    queries: null,
    time: 0,
    cardClock: 0,
  };

  let alive = false;
  let ui = null;
  let layout = { rooms: [], items: [] }; // del mapa provisional
  let bubbles = [];
  let phrases = {};

  // ---------- Paneles (se dibujan SOLO desde el snapshot) ----------

  function refreshToolbar() {
    if (!ui) return;
    ui.toolbar.update(
      toolbarState({
        mode,
        snapshot: state.snapshot,
        selection: state.selection,
        busy: state.busy,
        paused: state.paused,
        done: state.done,
      }),
      state.speed,
    );
  }

  function refreshCard() {
    if (!ui) return;
    const visual = state.selection ? (stage.director?.visualStatus?.(state.selection.id) ?? "") : "";
    const info = cardInfo(state.snapshot, state.selection, visual);
    if (info) ui.card.show(info);
    else ui.card.hide();
  }

  function refreshPanels() {
    if (!ui || !state.snapshot) return;
    ui.queues.render(state.snapshot, stage.renderer ?? null);
    ui.indicators.render(state.snapshot, scene.robotsFree());
    ui.hospital.textContent = state.snapshot.hospital || HOSPITAL_NAME;
    refreshToolbar();
    refreshCard();
  }

  function setStepBanner() {
    if (!ui || mode !== "scenario") return;
    const s = state.step;
    if (!s) ui.step.textContent = "";
    else if (s.index === 0) ui.step.textContent = `Paso 0/${s.total}: ${s.title || "listo para empezar"}`;
    else ui.step.textContent = `Paso ${s.index}/${s.total}: ${s.title}${s.done ? " (fin)" : ""}`;
  }

  // ---------- Comandos ----------

  async function run(command) {
    if (state.busy) return null;
    state.busy = true;
    refreshToolbar();
    try {
      const result = await command();
      if (alive) scene.onResult(result);
      return result;
    } catch (err) {
      if (alive) ui.log.push(describeError(err));
      return null;
    } finally {
      state.busy = false;
      if (alive) refreshToolbar();
    }
  }

  function attack() {
    const { patient, reason } = chooseAttackTarget(state.snapshot, state.selection);
    if (!patient) return ui.log.push(reason);
    const location = scene.locationForAttack(patient.id);
    if (location === null) return ui.log.push("No sé en qué zona está: no llegó la lista de zonas.");
    return run(() => api.attack(patient.id, location));
  }

  function wakeUp() {
    const { patient, reason } = chooseWakeTarget(state.snapshot, state.selection);
    if (!patient) return ui.log.push(reason);
    return run(() => api.wakeUp(patient.id));
  }

  async function next() {
    const result = await run(api.scenarioNext);
    if (result?.step?.done) await showQueries();
  }

  async function showQueries() {
    try {
      state.queries ??= await api.getQueries();
    } catch (err) {
      if (alive) ui.log.push(describeError(err));
      return;
    }
    if (!alive) return;
    // [5.3] es el aviso del paso 5; si la numeración cambiara, el último noRoom.
    const notices = state.step5Notices.length
      ? state.step5Notices
      : state.scenarioNotices.filter((n) => n.kind === "noRoom").slice(-1);
    ui.queriesPanel.show(formatQueries(state.queries, state.snapshot, state.locations, notices));
  }

  const handlers = {
    addPatient: () => run(api.addPatient),
    addDoctor: () => run(() => api.addStaff("doctor")),
    addOrderly: () => run(() => api.addStaff("orderly")),
    attack,
    wakeUp,
    next,
    queries: showQueries,
    pause: () => {
      state.paused = !state.paused;
      refreshToolbar();
    },
    speed: () => {
      state.speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length];
      refreshToolbar();
    },
    menu: () => app.showScene("menu"),
  };

  // ---------- Selección con el mouse ----------

  function onCanvasClick(e) {
    const rect = app.canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) * SCREEN_W) / rect.width;
    const sy = ((e.clientY - rect.top) * SCREEN_H) / rect.height;
    const w = stage.camera?.toWorld ? stage.camera.toWorld(sx, sy) : { x: sx, y: sy };
    scene.selectAt(w.x, w.y);
  }

  function select(selection) {
    state.selection = selection;
    refreshCard();
    refreshToolbar();
  }

  // ---------- Arranque ----------

  async function start() {
    const [locations, phraseData] = await Promise.all([api.getLocations().catch(() => []), loadPhrases()]);
    state.locations = locations;
    phrases = phraseData;
    if (!alive) return;

    let result;
    try {
      result = mode === "scenario" ? await api.scenarioStart() : await api.reset(app.config);
    } catch (err) {
      if (!alive) return;
      ui.log.push(describeError(err));
      // Sin reset (p. ej. la API todavía responde 501) se muestra el estado actual.
      try {
        result = { snapshot: await api.getState(), events: [], notices: [] };
        ui.log.push("Se muestra el hospital tal como está en el servidor.");
      } catch (err2) {
        if (alive) ui.log.push(describeError(err2));
        return;
      }
    }
    if (!alive) return;
    await scene.connectStage(result.snapshot);
    if (!alive) return;
    scene.onResult(result, { initial: true });
    const name = result.snapshot.hospital || HOSPITAL_NAME;
    ui.log.push(
      mode === "scenario"
        ? `Caso de prueba del ${name}. Pulsa «Siguiente paso».`
        : `¡Bienvenido al ${name}! Haz clic en alguien para ver su ficha.`,
    );
  }

  // ---------- La escena ----------

  const scene = {
    layout: { kind: "play", reserveW: 360, reserveH: 300, maxScale: 3 },
    mode,
    state,
    stage,

    mount(root) {
      alive = true;
      const queuesBox = h("section", { class: "ui-box side-queues" }, h("h2", { class: "ui-box-title" }, "Colas"));
      const queuesEl = h("div");
      queuesBox.append(queuesEl);
      queuesBox.hidden = !app.config.showQueues;
      const indEl = h("div");
      const cardEl = h("section", { class: "ui-box side-card" });
      const toolsEl = h("div", { class: "play-tools ui-box" });
      const logEl = h("div", { class: "log-scroll" });
      const queriesEl = h("div", { class: "queries-overlay" });
      const hospital = h("strong", { class: "banner-name" }, HOSPITAL_NAME);
      const step = h("span", { class: "banner-step" });

      root.append(
        h(
          "header",
          { class: "play-banner ui-box" },
          hospital,
          h("span", { class: "banner-mode" }, mode === "scenario" ? "Caso de prueba" : "Modo libre"),
          step,
        ),
        h("aside", { class: "play-side" }, h("section", { class: "ui-box" }, h("h2", { class: "ui-box-title" }, "Indicadores"), indEl), queuesBox, cardEl),
        toolsEl,
        h("section", { class: "play-log ui-box" }, logEl),
        queriesEl,
      );

      ui = {
        hospital,
        step,
        indicators: Indicators(indEl, { robotsTotal: app.config.robots }),
        queues: QueuePanel(queuesEl, { onSelect: (id) => select({ kind: "patient", id }) }),
        card: Card(cardEl, { onClose: () => select(null) }),
        toolbar: Toolbar(toolsEl, handlers).setMode(mode),
        log: Log(logEl, { maxLines: 40 }),
        queriesPanel: QueriesPanel(queriesEl),
      };
      app.canvas.addEventListener("click", onCanvasClick);
      app.canvas.classList.add("clickable");
      refreshToolbar();
      start().catch((err) => alive && ui.log.push(describeError(err)));
    },

    unmount() {
      alive = false;
      app.canvas.removeEventListener("click", onCanvasClick);
      app.canvas.classList.remove("clickable");
      ui?.log.destroy();
      ui = null;
    },

    update(dt) {
      // Pausa congela el mapa; la velocidad multiplica dt. El registro tiene
      // su propio reloj y sigue escribiendo.
      if (state.paused) return;
      const d = dt * state.speed;
      state.time += d;
      stage.director?.update(d);
      for (const b of bubbles) b.update(d);
      bubbles = bubbles.filter((b) => !b.done);
      // La ficha muestra lo que hace la entidad en el mapa: se refresca seguido.
      if (stage.director && state.selection) {
        state.cardClock += d;
        if (state.cardClock > 0.25) {
          state.cardClock = 0;
          refreshCard();
        }
      }
    },

    draw(ctx) {
      if (stage.world && stage.drawWorld) {
        stage.drawWorld(ctx, stage.world, stage.camera);
        stage.director?.draw(ctx, stage.camera, stage.renderer);
      } else {
        drawPlaceholder(ctx, state.snapshot, layout, { selection: state.selection, t: state.time });
      }
      for (const b of bubbles) b.draw(ctx);
      if (state.paused) {
        ctx.fillStyle = "rgba(29, 43, 58, 0.55)";
        ctx.fillRect(SCREEN_W / 2 - 30, 6, 60, 14);
        ctx.fillStyle = "#fdf6e3";
        ctx.font = '8px "PixelFont", monospace';
        ctx.textBaseline = "top";
        ctx.textAlign = "center";
        ctx.fillText("PAUSA", SCREEN_W / 2, 9);
        ctx.textAlign = "left";
      }
    },

    // CONEXIÓN: se llama tras reset/scenarioStart con el snapshot inicial.
    // Aquí la integración arma mundo y director si pasó params.build.
    async connectStage(snapshot) {
      if (params.build) {
        try {
          Object.assign(stage, (await params.build(snapshot, app.config, { canvas: app.canvas })) ?? {});
        } catch (err) {
          console.error(err);
          ui?.log.push(describeError(err));
        }
      }
      stage.director?.sync(snapshot);
    },

    // CONEXIÓN: cada Result de la API pasa por aquí. Hoy actualiza paneles y
    // registro; con director, además anima los eventos.
    onResult(result, { initial = false } = {}) {
      state.snapshot = result.snapshot;
      if (stage.director) {
        if (!initial) stage.director.apply(result.events ?? [], result.snapshot);
      } else {
        layout = placeholderLayout(result.snapshot);
        for (const e of result.events ?? []) if (e.type === "patientWoke") wakeBubble(e.patient);
      }

      if (result.step) {
        state.step = result.step;
        if (result.step.index === 5 || /\[5\.3\]/.test(result.step.title ?? "")) state.step5Notices = result.notices ?? [];
        if (result.step.index > 0) ui.log.push(`— Paso ${result.step.index}/${result.step.total}: ${result.step.title} —`);
        setStepBanner();
      }
      if (mode === "scenario") state.scenarioNotices.push(...(result.notices ?? []));

      for (const e of result.events ?? []) ui.log.push(describeEvent(e, result.snapshot, state.locations));
      for (const n of result.notices ?? []) ui.log.push(describeNotice(n));

      if (result.step?.done && !state.done) {
        state.done = true;
        ui.log.push("¡Fin del caso de prueba! Mira las consultas.");
      }
      refreshPanels();
    },

    // CONEXIÓN: (wx, wy) en coordenadas de mundo (ya pasadas por camera.toWorld).
    selectAt(wx, wy) {
      const hit = stage.director ? stage.director.pick(wx, wy) : pickPlaceholder(layout, wx, wy);
      select(hit ?? null);
      return hit ?? null;
    },

    // CONEXIÓN: id de hospital.Location donde ocurre el ataque. Con director,
    // la zona donde está el paciente; sin él, un pasillo al azar.
    locationForAttack(patientId) {
      const zone = stage.director?.locationOf?.(patientId) ?? null;
      const id = zone ? locationIdByName(state.locations, zone) : null;
      return id ?? pickHallwayLocation(state.locations);
    },

    // CONEXIÓN (propuesta al contrato): director.robotsFree() aún no existe;
    // mientras tanto todas las camillas configuradas están en base.
    robotsFree() {
      const fromDirector = stage.director?.robotsFree?.();
      return { free: fromDirector ?? app.config.robots, total: app.config.robots };
    },
  };

  // Globo al despertar en el mapa provisional (con director, lo maneja él).
  function wakeBubble(patientId) {
    const it = layout.items.find((i) => i.id === patientId);
    const p = findPatient(state.snapshot, patientId);
    const text = pickPhrase(phrases, "wake") || `¡${p?.name ?? patientId} despertó!`;
    if (it) bubbles.push(new Bubble(text, it.x + it.w / 2, it.y - 2));
  }

  return scene;
}
