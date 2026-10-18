// Indicadores: habitaciones, personal, pacientes y camillas robot.
import { h } from "./dom.js";
import { indicatorCounts } from "./model.js";

// opts.robotsTotal: camillas robot configuradas (para mostrar "2/3").
export function Indicators(el, { robotsTotal = null } = {}) {
  el.classList.add("indicators");

  function row(label, free, busy, freeText = "libres", busyText = "ocupadas") {
    return h(
      "li",
      { class: "ind-row" },
      h("span", { class: "ind-label" }, label),
      h("span", { class: "ind-free" }, `${free} ${freeText}`),
      h("span", { class: "ind-busy" }, `${busy} ${busyText}`),
    );
  }

  return {
    el,
    setRobotsTotal(n) {
      robotsTotal = n;
    },
    // robotsFree: número de camillas libres (o { free, total }).
    render(snapshot, robotsFree) {
      const c = indicatorCounts(snapshot, robotsFree);
      const total = c.robotsTotal ?? robotsTotal;
      const robots =
        c.robotsFree === null
          ? "—"
          : total !== null && total !== undefined
            ? `${c.robotsFree}/${total} en base`
            : `${c.robotsFree} en base`;
      el.replaceChildren(
        h(
          "ul",
          { class: "ind-list" },
          row("Habitaciones", c.roomsFree, c.roomsBusy),
          row("Personal", c.staffFree, c.staffBusy, "libres", "atendiendo"),
          row("Pacientes", c.patientsAwake, c.patientsAsleep, "despiertos", "dormidos"),
          h("li", { class: "ind-row" }, h("span", { class: "ind-label" }, "Camillas robot"), h("span", { class: "ind-free" }, robots)),
        ),
      );
    },
  };
}
