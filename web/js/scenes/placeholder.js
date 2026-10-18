// Mapa provisional mientras no llegan web/js/world/ y el Director: dibuja el
// snapshot tal cual (habitaciones, pasillo, despiertos y personal) con
// cuadritos. La integración lo reemplaza pasando world/drawWorld/director.
import { colorFromId } from "../ui/model.js";

const FONT = '8px "PixelFont", monospace';
const ROOM_W = 32;
const ROOM_H = 30;

// placeholderLayout es puro: calcula dónde va cada cosa (en píxeles de la
// pantalla de 384×216) para dibujar y para saber qué se clicó.
export function placeholderLayout(snapshot) {
  const rooms = [];
  const items = [];
  (snapshot?.rooms ?? []).forEach((r, i) => {
    const x = 8 + i * (ROOM_W + 5);
    rooms.push({ number: r.number, x, y: 16, w: ROOM_W, h: ROOM_H });
  });
  const roomByNumber = new Map(rooms.map((r) => [r.number, r]));

  let hall = 0;
  let awake = 0;
  for (const p of snapshot?.patients ?? []) {
    const room = p.room ? roomByNumber.get(p.room) : null;
    if (p.asleep && room) {
      items.push({ kind: "patient", id: p.id, x: room.x + 9, y: room.y + 14, w: 14, h: 7, pose: "bed" });
    } else if (p.asleep) {
      const col = hall % 20;
      const row = Math.floor(hall / 20);
      items.push({ kind: "patient", id: p.id, x: 10 + col * 18, y: 70 + row * 14, w: 14, h: 7, pose: "lying" });
      hall++;
    } else {
      const col = awake % 26;
      const row = Math.floor(awake / 26);
      items.push({ kind: "patient", id: p.id, x: 10 + col * 14, y: 122 + row * 18, w: 9, h: 12, pose: "stand" });
      awake++;
    }
  }
  (snapshot?.staff ?? []).forEach((s, i) => {
    items.push({ kind: s.kind, id: s.id, x: 10 + i * 16, y: 186, w: 10, h: 13, pose: "stand" });
  });
  return { rooms, items };
}

// pickPlaceholder devuelve { kind, id } de lo que está en (x, y), con un
// margen de 2 px para que los cuadritos chicos sean fáciles de clicar.
export function pickPlaceholder(layout, x, y) {
  for (const it of [...layout.items].reverse()) {
    if (x >= it.x - 2 && x < it.x + it.w + 2 && y >= it.y - 2 && y < it.y + it.h + 2) {
      return { kind: it.kind, id: it.id };
    }
  }
  return null;
}

function label(ctx, text, x, y) {
  ctx.fillStyle = "#2b2118";
  ctx.fillText(text, x, y);
}

// drawPlaceholder pinta el layout. t: segundos (para un leve vaivén).
export function drawPlaceholder(ctx, snapshot, layout, { selection = null, t = 0 } = {}) {
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = "top";
  // Piso por zonas.
  ctx.fillStyle = "#e9dfc6";
  ctx.fillRect(0, 0, 384, 216);
  ctx.fillStyle = "#cfe8df";
  ctx.fillRect(0, 56, 384, 58); // pasillo
  ctx.fillStyle = "#f5ecd2";
  ctx.fillRect(0, 114, 384, 62); // sala de espera
  ctx.fillStyle = "#d8cdb2";
  ctx.fillRect(0, 176, 384, 40); // sala de personal
  label(ctx, "Habitaciones", 6, 4);
  label(ctx, "Pasillo (dormidos)", 6, 58);
  label(ctx, "Despiertos", 6, 113);
  label(ctx, "Personal", 6, 176);
  ctx.fillStyle = "#8a7a5c";
  ctx.fillText("Mapa provisional: falta web/js/world", 200, 4);

  const queued = new Set([...(snapshot?.roomQueue ?? []), ...(snapshot?.staffQueue ?? [])]);
  const inBoth = new Set((snapshot?.roomQueue ?? []).filter((id) => (snapshot?.staffQueue ?? []).includes(id)));

  for (const r of layout.rooms) {
    ctx.fillStyle = "#2b2118";
    ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    ctx.fillStyle = "#fdf6e3";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "#8fd8c4";
    ctx.fillRect(r.x + 6, r.y + 12, 20, 11); // cama
    label(ctx, String(r.number), r.x + 4, r.y + 2);
  }

  const busy = new Set((snapshot?.staff ?? []).filter((s) => s.busyWith).map((s) => s.id));
  for (const it of layout.items) {
    const bob = it.pose === "stand" ? Math.round(Math.sin(t * 3 + it.x) * 0.6) : 0;
    const y = it.y + bob;
    let color = colorFromId(it.id);
    if (it.kind === "doctor") color = "#fdf6e3";
    else if (it.kind === "orderly") color = "#8fd8c4";
    else if (it.kind === "other") color = "#c9b48a";
    ctx.fillStyle = "#2b2118";
    ctx.fillRect(it.x - 1, y - 1, it.w + 2, it.h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(it.x, y, it.w, it.h);
    if (it.kind === "doctor" || it.kind === "orderly") {
      ctx.fillStyle = it.kind === "doctor" ? "#d62839" : "#2f80c2";
      ctx.fillRect(it.x + 3, y + 3, 4, 4);
    }
    if (busy.has(it.id)) {
      ctx.fillStyle = "#f7c948";
      ctx.fillRect(it.x, y + it.h - 2, it.w, 2);
    }
    if (it.kind === "patient" && queued.has(it.id)) {
      ctx.fillStyle = inBoth.has(it.id) ? "#d62839" : "#2f80c2";
      ctx.fillRect(it.x + it.w / 2 - 1, y - 9, 2, 5);
      ctx.fillRect(it.x + it.w / 2 - 1, y - 3, 2, 2);
    }
    if (selection && selection.id === it.id) {
      ctx.strokeStyle = "#f7c948";
      ctx.lineWidth = 1;
      ctx.strokeRect(it.x - 2.5, y - 2.5, it.w + 5, it.h + 5);
    }
  }
  ctx.restore();
}
