// Barra de acciones bajo el mapa. Qué está habilitado lo decide
// toolbarState (model.js); aquí solo se pinta.
import { h } from "./dom.js";

// Botones en orden. group "manual" son los comandos del modo libre.
const BUTTONS = [
  { key: "addPatient", label: "+Paciente", group: "manual" },
  { key: "addDoctor", label: "+Doctor", group: "manual" },
  { key: "addOrderly", label: "+Camillero", group: "manual" },
  { key: "attack", label: "Ataque", group: "manual" },
  { key: "wakeUp", label: "Despertar", group: "manual" },
  { key: "next", label: "Siguiente paso", group: "scenario" },
  { key: "queries", label: "Consultas", group: "scenario" },
  { key: "pause", label: "Pausa", group: "always" },
  { key: "speed", label: "×1", group: "always" },
  { key: "menu", label: "Menú", group: "always" },
];

// handlers: { addPatient, addDoctor, addOrderly, attack, wakeUp, next,
//             queries, pause, speed, menu }, todos opcionales.
export function Toolbar(el, handlers = {}) {
  el.classList.add("toolbar");
  const buttons = {};
  for (const b of BUTTONS) {
    buttons[b.key] = h(
      "button",
      { class: `btn btn-${b.key}`, dataset: { group: b.group }, onclick: () => handlers[b.key]?.() },
      b.label,
    );
  }
  el.replaceChildren(...BUTTONS.map((b) => buttons[b.key]));

  let mode = "free";

  const api = {
    el,
    buttons,
    // En modo escenario los comandos manuales se ven deshabilitados y
    // aparecen «Siguiente paso» y «Consultas».
    setMode(next) {
      mode = next === "scenario" ? "scenario" : "free";
      el.dataset.mode = mode;
      for (const b of BUTTONS) {
        if (b.group === "scenario") buttons[b.key].hidden = mode !== "scenario";
        if (b.group === "manual" && mode === "scenario") buttons[b.key].disabled = true;
      }
      return api;
    },
    get mode() {
      return mode;
    },
    // state: salida de toolbarState; speed: 1|2|4.
    update(state, speed = 1) {
      for (const [key, btn] of Object.entries(buttons)) {
        if (key === "menu") continue;
        btn.disabled = !state[key];
      }
      buttons.pause.textContent = state.paused ? "Seguir" : "Pausa";
      buttons.pause.classList.toggle("active", Boolean(state.paused));
      buttons.speed.textContent = `×${speed}`;
      return api;
    },
  };
  return api.setMode("free");
}
