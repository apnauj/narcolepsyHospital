// Ficha de lo que se seleccionó con un clic: nombre, rol, estado, colas y
// lo que está haciendo en el mapa. Los datos los arma cardInfo (model.js).
import { h } from "./dom.js";

export function Card(el, { onClose } = {}) {
  el.classList.add("card");
  el.hidden = true;

  function field(label, value) {
    return h("div", { class: "card-field" }, h("span", { class: "card-label" }, label), h("span", { class: "card-value" }, value));
  }

  const api = {
    el,
    // info: { name, role, state, queues: string[], visual }
    show({ name, role, state, queues = [], visual = "" }) {
      // replaceChildren(null) insertaría el texto "null": se filtran los vacíos.
      const parts = [
        h(
          "header",
          { class: "card-head" },
          h("strong", { class: "card-name" }, name),
          h("button", { class: "card-close", title: "Cerrar", onclick: () => (api.hide(), onClose?.()) }, "×"),
        ),
        field("Rol", role),
        field("Estado", state),
        field("Colas", queues.length ? queues.join(", ") : "En ninguna"),
        visual ? field("En el mapa", visual) : null,
      ];
      el.replaceChildren(...parts.filter(Boolean));
      el.hidden = false;
      return api;
    },
    hide() {
      el.hidden = true;
      el.replaceChildren();
      return api;
    },
  };
  return api;
}
