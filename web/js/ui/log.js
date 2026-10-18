// Registro de eventos con texto que aparece letra por letra. Tiene su
// propio reloj: sigue escribiendo aunque el juego esté en pausa.
import { h } from "./dom.js";
import { Typewriter } from "./typewriter.js";

export function Log(el, { maxLines = 40, cps = 60 } = {}) {
  el.classList.add("log");
  const tw = new Typewriter({ maxLines, cps });
  const list = h("ol", { class: "log-lines" });
  el.replaceChildren(list);

  let timer = null;
  let last = 0;

  function paint() {
    const visible = tw.visible();
    // Se reutilizan los <li> existentes: solo cambia el texto.
    while (list.children.length > visible.length) list.firstElementChild.remove();
    while (list.children.length < visible.length) list.append(h("li", { class: "log-line" }));
    visible.forEach((text, i) => {
      const li = list.children[i];
      if (li.textContent !== text) li.textContent = text;
      li.classList.toggle("typing", i === visible.length - 1 && tw.typing);
    });
    el.scrollTop = el.scrollHeight;
  }

  function step() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (tw.tick(dt)) paint();
    if (!tw.typing) stop();
  }

  function start() {
    if (timer !== null) return;
    last = performance.now();
    timer = setInterval(step, 16);
  }

  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  return {
    el,
    push(text) {
      tw.push(text);
      paint();
      start();
    },
    clear() {
      tw.clear();
      paint();
    },
    destroy() {
      stop();
    },
  };
}
