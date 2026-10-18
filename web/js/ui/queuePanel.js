// Panel de colas: retratos en el orden EXACTO de roomQueue y staffQueue.
// Se redibuja entero con cada snapshot; no guarda estado propio.
import { h } from "./dom.js";
import { queueEntries } from "./model.js";

const PORTRAIT_PX = 24;

// opts.onSelect(patientId): clic en un retrato.
export function QueuePanel(el, { onSelect } = {}) {
  el.classList.add("queue-panel");

  function portrait(entry, renderer) {
    let face;
    const img = renderer?.portrait?.("patient", entry.id);
    if (img) {
      // Retrato del renderer, copiado a un canvas propio sin suavizado.
      face = h("canvas", { class: "portrait-img", width: PORTRAIT_PX, height: PORTRAIT_PX });
      const c = face.getContext("2d");
      c.imageSmoothingEnabled = false;
      c.drawImage(img, 0, 0, PORTRAIT_PX, PORTRAIT_PX);
    } else {
      face = h("span", { class: "portrait-square", style: { background: entry.color } }, entry.initials);
    }
    return h(
      "button",
      {
        class: `portrait${entry.inBoth ? " in-both" : ""}`,
        title: `${entry.position}. ${entry.name} (${entry.id})`,
        dataset: { id: entry.id },
        onclick: () => onSelect?.(entry.id),
      },
      h("span", { class: "portrait-pos" }, entry.position),
      face,
      entry.inBoth ? h("span", { class: "portrait-alert" }, "!") : null,
    );
  }

  function queue(title, entries, renderer) {
    return h(
      "div",
      { class: "queue" },
      h("h3", { class: "queue-title" }, `${title} (${entries.length})`),
      entries.length
        ? h("div", { class: "queue-row" }, entries.map((e) => portrait(e, renderer)))
        : h("p", { class: "queue-empty" }, "Nadie en espera."),
    );
  }

  return {
    el,
    render(snapshot, renderer = null) {
      const { room, staff } = queueEntries(snapshot);
      el.replaceChildren(
        queue("Cola de Atención", staff, renderer),
        queue("Cola de Habitaciones", room, renderer),
      );
    },
  };
}
