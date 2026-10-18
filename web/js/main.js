// Punto de entrada del frontend. Por ahora solo comprueba que la API
// responde y dibuja el nombre del hospital en el canvas.
import { getState } from "./api.js";

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const state = await getState();
ctx.fillStyle = "#8fd8c4";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = "#2b2118";
ctx.font = "8px monospace";
ctx.fillText(state.hospital, 8, 16);
ctx.fillText(`${state.patients.length} pacientes, ${state.rooms.length} habitaciones`, 8, 28);
