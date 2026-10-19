// Configuración del modo libre. Valida en vivo con validateConfig y guarda
// en app.config (y en localStorage si se puede).
import { h } from "../ui/dom.js";
import { DEFAULT_CONFIG, LIMITS, SPEEDS, validateConfig } from "../ui/settings.js";
import { drawMenuBackground } from "./menu.js";

const NUMBER_FIELDS = [
  { key: "rooms", label: "Habitaciones" },
  { key: "doctors", label: "Doctores" },
  { key: "orderlies", label: "Camilleros" },
  { key: "patients", label: "Pacientes iniciales" },
  { key: "robots", label: "Camillas robot" },
];

export function createConfigScene(_params, app) {
  let t = 0;
  let root = null;
  let draft = { ...app.config };
  const inputs = {};
  const errorEls = {};
  let staffError = null;
  let saveBtn = null;
  let status = null;
  let volumeText = null;
  let musicText = null;

  function readForm() {
    const out = { ...draft };
    for (const f of NUMBER_FIELDS) out[f.key] = inputs[f.key].value;
    out.speed = Number(root.querySelector('input[name="speed"]:checked')?.value ?? draft.speed);
    out.showQueues = inputs.showQueues.checked;
    out.volume = Number(inputs.volume.value) / 100;
    out.musicVolume = Number(inputs.musicVolume.value) / 100;
    return out;
  }

  function fillForm(cfg) {
    for (const f of NUMBER_FIELDS) inputs[f.key].value = String(cfg[f.key]);
    for (const radio of root.querySelectorAll('input[name="speed"]')) radio.checked = Number(radio.value) === cfg.speed;
    inputs.showQueues.checked = cfg.showQueues;
    inputs.volume.value = String(Math.round((cfg.volume ?? 0) * 100));
    inputs.musicVolume.value = String(Math.round((cfg.musicVolume ?? DEFAULT_CONFIG.musicVolume) * 100));
    showVolume();
  }

  // Texto junto al deslizador: «Silencio» o el porcentaje.
  function showVolume() {
    const n = Number(inputs.volume.value);
    volumeText.textContent = n > 0 ? `${n} %` : "Silencio";
    const m = Number(inputs.musicVolume.value);
    musicText.textContent = m > 0 ? `${m} %` : "Silencio";
  }

  function revalidate() {
    const { ok, errors } = validateConfig(readForm());
    for (const f of NUMBER_FIELDS) {
      errorEls[f.key].textContent = errors[f.key] ?? "";
      inputs[f.key].classList.toggle("invalid", Boolean(errors[f.key]));
    }
    staffError.textContent = errors.staff ?? "";
    saveBtn.disabled = !ok;
    status.textContent = "";
    return ok;
  }

  // Botones − y + para no depender de las flechas del input numérico.
  function stepper(key, delta) {
    const { min, max } = LIMITS[key];
    const n = Number.parseInt(inputs[key].value, 10);
    const next = Number.isInteger(n) ? Math.min(max, Math.max(min, n + delta)) : min;
    inputs[key].value = String(next);
    revalidate();
  }

  function numberRow({ key, label }) {
    const { min, max } = LIMITS[key];
    inputs[key] = h("input", { type: "number", id: `cfg-${key}`, min, max, step: 1, inputmode: "numeric", oninput: revalidate });
    errorEls[key] = h("span", { class: "cfg-error", role: "alert" });
    return h(
      "div",
      { class: "cfg-row" },
      h("label", { for: `cfg-${key}` }, `${label} (${min}–${max})`),
      h(
        "span",
        { class: "cfg-stepper" },
        h("button", { type: "button", class: "btn btn-small", onclick: () => stepper(key, -1), "aria-label": `Menos ${label}` }, "−"),
        inputs[key],
        h("button", { type: "button", class: "btn btn-small", onclick: () => stepper(key, 1), "aria-label": `Más ${label}` }, "+"),
      ),
      errorEls[key],
    );
  }

  function save() {
    const { ok, value } = validateConfig(readForm());
    if (!ok) return;
    draft = value;
    app.setConfig(value);
    app.showScene("menu");
  }

  return {
    layout: { kind: "full", reserveW: 32, reserveH: 32, maxScale: 4 },
    mount(el) {
      root = el;
      inputs.showQueues = h("input", { type: "checkbox", id: "cfg-showQueues", onchange: revalidate });
      volumeText = h("span", { class: "cfg-volume-value" });
      inputs.volume = h("input", {
        type: "range",
        id: "cfg-volume",
        min: 0,
        max: 100,
        step: 10,
        oninput: () => {
          showVolume();
          revalidate();
        },
      });
      musicText = h("span", { class: "cfg-volume-value" });
      inputs.musicVolume = h("input", {
        type: "range",
        id: "cfg-musicVolume",
        min: 0,
        max: 100,
        step: 10,
        oninput: () => {
          showVolume();
          revalidate();
          // Vista previa en vivo; al salir sin guardar se restaura (unmount).
          app.music?.setVolume(Number(inputs.musicVolume.value) / 100);
        },
      });
      staffError = h("p", { class: "cfg-error", role: "alert" });
      status = h("p", { class: "cfg-status" });
      saveBtn = h("button", { type: "submit", class: "btn" }, "Guardar");

      const form = h(
        "form",
        {
          class: "config ui-box",
          onsubmit: (e) => {
            e.preventDefault();
            save();
          },
        },
        h("h2", { class: "ui-box-title" }, "Configuración"),
        NUMBER_FIELDS.map(numberRow),
        staffError,
        h(
          "fieldset",
          { class: "cfg-row cfg-speed" },
          h("legend", {}, "Velocidad"),
          SPEEDS.map((s) =>
            h("label", { class: "cfg-radio" }, h("input", { type: "radio", name: "speed", value: s, onchange: revalidate }), ` ×${s}`),
          ),
        ),
        h("div", { class: "cfg-row" }, h("label", { for: "cfg-showQueues", class: "cfg-check" }, inputs.showQueues, " Mostrar el panel de colas")),
        h("div", { class: "cfg-row" }, h("label", { for: "cfg-volume" }, "Volumen de los sonidos"), h("span", {}, inputs.volume, " ", volumeText)),
        h("div", { class: "cfg-row" }, h("label", { for: "cfg-musicVolume" }, "Volumen de la música"), h("span", {}, inputs.musicVolume, " ", musicText)),
        h(
          "div",
          { class: "cfg-actions" },
          saveBtn,
          h(
            "button",
            {
              type: "button",
              class: "btn",
              onclick: () => {
                fillForm(DEFAULT_CONFIG);
                revalidate();
                status.textContent = "Valores por defecto (sin guardar).";
              },
            },
            "Por defecto",
          ),
          h("button", { type: "button", class: "btn", onclick: () => app.showScene("menu") }, "Volver"),
        ),
        status,
      );
      el.append(h("div", { class: "menu menu-center" }, form));
      fillForm(draft);
      revalidate();
    },
    unmount() {
      app.music?.setVolume(app.config.musicVolume);
      root?.replaceChildren();
      root = null;
    },
    update(dt) {
      t += dt;
    },
    draw(ctx) {
      drawMenuBackground(ctx, t);
      // Velo para que el formulario se lea mejor.
      ctx.fillStyle = "rgba(29, 43, 58, 0.35)";
      ctx.fillRect(0, 0, 384, 216);
    },
  };
}
