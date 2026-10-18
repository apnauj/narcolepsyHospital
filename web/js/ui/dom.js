// Ayudas mínimas para armar DOM sin plantillas de texto (evita inyectar
// HTML con nombres que vienen de la API).

// h("button", { class: "btn", onclick }, "Texto", otroNodo)
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else if (key === "class") {
      node.className = value;
    } else if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else if (key === "style" && typeof value === "object") {
      Object.assign(node.style, value);
    } else if (value === true) {
      node.setAttribute(key, "");
    } else {
      node.setAttribute(key, String(value));
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else node.append(child instanceof Node ? child : String(child));
  }
}

// Caja con el borde doble estilo Pokémon y un título opcional.
export function box(title, ...children) {
  return h("section", { class: "ui-box" }, title ? h("h2", { class: "ui-box-title" }, title) : null, ...children);
}
