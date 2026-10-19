// Apariencia de cada personaje: combinación de capas elegida por hash del ID,
// así el mismo ID siempre se ve igual (también entre recargas). Las
// cantidades salen del manifest, nunca del código.

import { getArt } from "./sheets.js";

/** FNV-1a de 32 bits sobre el texto (sin signo). */
export function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function needArt(art) {
  const a = art ?? getArt();
  if (!a) throw new Error("no hay arte cargado: llama a loadArt() primero");
  return a;
}

/**
 * Apariencia de un paciente: {skin, torso, head, accessory}, cada uno un
 * índice dentro de art.characters.layers[categoría]. Determinista por ID;
 * cada categoría usa su propio hash para que no queden correlacionadas.
 */
export function appearanceFor(id, art) {
  const ch = needArt(art).characters;
  const out = {};
  for (const cat of ch.layerOrder) {
    const pool = ch.patientPools[cat];
    out[cat] = pool[hash32(`${id}:${cat}`) % pool.length];
  }
  return out;
}

/**
 * Apariencia del personal según su tipo ("doctor" | "orderly" | "other"):
 * se elige un preset del manifest por hash y peso. Un tipo desconocido usa
 * "other".
 */
export function staffAppearanceFor(kind, id, art) {
  const ch = needArt(art).characters;
  const presets = ch.staff[kind] ?? ch.staff.other;
  const total = presets.reduce((s, p) => s + p.weight, 0);
  let r = hash32(`${kind}:${id}`) % total;
  for (const p of presets) {
    if (r < p.weight) return { ...p.appearance, preset: p.id };
    r -= p.weight;
  }
  return { ...presets[0].appearance, preset: presets[0].id };
}

/**
 * Capas a dibujar, en orden (de abajo hacia arriba), para una apariencia.
 * Las capas sin hoja (calvo, sin accesorio) no aparecen.
 */
export function layersFor(appearance, art) {
  const ch = needArt(art).characters;
  const out = [];
  for (const cat of ch.layerOrder) {
    const l = ch.layers[cat][appearance[cat]];
    if (!l) throw new Error(`capa ${cat} fuera de rango: ${appearance[cat]}`);
    if (l.sheet) out.push(l);
  }
  return out;
}
