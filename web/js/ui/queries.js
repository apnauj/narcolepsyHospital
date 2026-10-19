// Panel con las 4 consultas del enunciado, al final del caso de prueba.
// Las secciones las arma formatQueries (model.js).
import { h } from "./dom.js";

export function QueriesPanel(el, { onClose } = {}) {
  el.classList.add("queries");
  el.hidden = true;

  const api = {
    el,
    // sections: [{ tag, title, lines }]
    show(sections) {
      el.replaceChildren(
        h(
          "div",
          { class: "ui-box queries-box", role: "dialog", "aria-label": "Consultas" },
          h(
            "header",
            { class: "queries-head" },
            h("h2", { class: "ui-box-title" }, "Consultas del caso de prueba"),
            h("button", { class: "btn", onclick: () => (api.hide(), onClose?.()) }, "Cerrar"),
          ),
          sections.map((s) =>
            h(
              "section",
              { class: "query" },
              h("h3", { class: "query-title" }, h("span", { class: "query-tag" }, s.tag), ` ${s.title}`),
              h("ul", { class: "query-lines" }, s.lines.map((l) => h("li", {}, l))),
            ),
          ),
        ),
      );
      el.hidden = false;
      return api;
    },
    hide() {
      el.hidden = true;
      return api;
    },
  };
  return api;
}
