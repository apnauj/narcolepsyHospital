// Créditos: quién hizo el proyecto y qué se usó (código, arte, fuente, música
// y herramientas). El contenido es dato puro (CREDITS) para poder probarlo en
// Node; la escena solo lo pinta sobre el fondo del menú.
import { h } from "../ui/dom.js";
import { drawMenuBackground, HOSPITAL_NAME } from "./menu.js";

// Cada sección: título y entradas { name, by?, license?, url?, note? }.
export const CREDITS = Object.freeze([
  {
    title: "Proyecto",
    items: [
      { name: HOSPITAL_NAME, note: "Programación Orientada a Objetos, Universidad EIA" },
      { name: "Autor", by: "Juan Pablo Alzate" },
      { name: "Profesor", by: "Sebastián Zapata Ramírez" },
    ],
  },
  {
    title: "Código",
    items: [
      { name: "Lógica del hospital y API REST", note: "Go, solo la biblioteca estándar (net/http, embed, sync)" },
      { name: "Interfaz gráfica", note: "HTML, CSS y JavaScript sin dependencias, dibujada en canvas" },
      { name: "Sprites propios", note: "Generados con tools/spritegen (Go) a partir de grillas de texto" },
    ],
  },
  {
    title: "Arte de terceros",
    items: [
      { name: "Roguelike Indoors", by: "Kenney", license: "CC0 1.0", url: "https://kenney.nl/assets/roguelike-indoors", note: "Muebles" },
      { name: "Roguelike/RPG pack", by: "Kenney y Lynn Evers", license: "CC0 1.0", url: "https://kenney.nl/assets/roguelike-rpg-pack", note: "Plantas" },
      { name: "Ninja Adventure", by: "Pixel-boy y AAA", license: "CC0 1.0", url: "https://pixel-boy.itch.io/ninja-adventure-asset-pack", note: "Emotes" },
      { name: "Public Pixel", by: "GGBotNet", license: "CC0 1.0", url: "https://ggbot.itch.io/public-pixel-font", note: "Fuente pixel" },
    ],
  },
  {
    title: "Música",
    items: [
      { name: "Música de fondo", note: "Aportada por el autor; no se incluye en el repositorio" },
    ],
  },
  {
    title: "Herramientas",
    items: [
      { name: "Claude Code", by: "Anthropic", note: "Asistente de IA usado en el desarrollo (ver AI_USAGE.md)" },
    ],
  },
]);

function itemRow(item) {
  const detail = [item.by, item.license].filter(Boolean).join(" · ");
  return h(
    "li",
    { class: "credits-item" },
    h("span", { class: "credits-name" }, item.name),
    detail ? h("span", { class: "credits-by" }, ` — ${detail}`) : null,
    item.note ? h("span", { class: "credits-note" }, item.note) : null,
    item.url ? h("a", { class: "credits-link", href: item.url, target: "_blank", rel: "noopener noreferrer" }, item.url) : null,
  );
}

export function createCreditsScene(_params, app) {
  let t = 0;
  let root = null;
  let onKey = null;

  return {
    layout: { kind: "full", reserveW: 32, reserveH: 32, maxScale: 4 },
    mount(el) {
      root = el;
      const back = h("button", { type: "button", class: "btn", onclick: () => app.showScene("menu") }, "Volver");
      el.append(
        h(
          "div",
          { class: "menu menu-center" },
          h(
            "section",
            { class: "credits ui-box", "aria-label": "Créditos" },
            h("h2", { class: "ui-box-title" }, "Créditos"),
            CREDITS.map((section) =>
              h("div", { class: "credits-section" }, h("h3", { class: "credits-title" }, section.title), h("ul", {}, section.items.map(itemRow))),
            ),
            h("div", { class: "cfg-actions" }, back),
          ),
        ),
      );
      back.focus({ preventScroll: true }); // la lista empieza arriba, con el título a la vista
      onKey = (e) => {
        if (e.key === "Escape") app.showScene("menu");
      };
      window.addEventListener("keydown", onKey);
    },
    unmount() {
      if (onKey) window.removeEventListener("keydown", onKey);
      onKey = null;
      root?.replaceChildren();
      root = null;
    },
    update(dt) {
      t += dt;
    },
    draw(ctx) {
      drawMenuBackground(ctx, t);
    },
  };
}
