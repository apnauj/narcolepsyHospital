// Carga del arte: lee assets/sprites.json y las imágenes que nombra. El
// código no conoce coordenadas: todo (filas, frames, anclas, orígenes) sale
// del manifest, así que cambiar un PNG por otro con el mismo formato no
// requiere tocar JS. Ver docs/gui/SPRITESHEETS.md.

let current = null;

/** El último Art cargado con loadArt (o null). */
export function getArt() {
  return current;
}

/** Fija el Art actual (lo usan los tests y loadArt). */
export function setArt(art) {
  current = art;
}

function defaultLoadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`no se pudo cargar ${url}`));
    img.src = url;
  });
}

async function defaultFetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`no se pudo cargar ${url}: ${res.status}`);
  return res.json();
}

/** Todas las rutas de hoja que nombra el manifest, sin repetir. */
export function sheetPaths(manifest) {
  const paths = new Set();
  for (const layers of Object.values(manifest.characters.layers)) {
    for (const l of layers) if (l.sheet) paths.add(l.sheet);
  }
  for (const e of [manifest.robot, manifest.stretcher, manifest.shadow]) paths.add(e.sheet);
  for (const e of Object.values(manifest.objects)) paths.add(e.sheet);
  paths.add(manifest.tiles.sheet);
  paths.add(manifest.emotes.sheet);
  return [...paths];
}

/**
 * Carga el manifest y todas sus imágenes.
 * @param {object} [opts]
 * @param {string} [opts.base]  carpeta de assets (por defecto "assets/")
 * @param {(url:string)=>Promise<object>} [opts.fetchJSON]
 * @param {(url:string)=>Promise<CanvasImageSource>} [opts.loadImage]
 * @returns {Promise<Art>}
 */
export async function loadArt({ base = "assets/", fetchJSON = defaultFetchJSON, loadImage = defaultLoadImage } = {}) {
  const manifest = await fetchJSON(base + "sprites.json");
  const paths = sheetPaths(manifest);
  const images = new Map();
  await Promise.all(paths.map(async (p) => images.set(p, await loadImage(base + p))));
  const art = makeArt(manifest, images);
  setArt(art);
  return art;
}

/**
 * Arma el objeto Art a partir del manifest y las imágenes ya cargadas.
 * Sirve también sin imágenes (Map vacío) para la lógica que solo necesita
 * el manifest.
 */
export function makeArt(manifest, images = new Map()) {
  const ch = manifest.characters;
  const layers = {};
  const indexById = {};
  for (const cat of ch.layerOrder) {
    layers[cat] = ch.layers[cat].map((l, i) => {
      indexById[`${cat}/${l.id}`] = i;
      return { ...l, index: i, image: l.sheet ? images.get(l.sheet) ?? null : null };
    });
  }
  const resolve = (cat, id) => {
    const i = indexById[`${cat}/${id}`];
    if (i === undefined) throw new Error(`capa ${cat} desconocida: ${id}`);
    return i;
  };
  // Pools de pacientes y presets de personal, en índices de layers[cat].
  const patientPools = {};
  for (const cat of ch.layerOrder) patientPools[cat] = ch.patients[cat].map((id) => resolve(cat, id));
  const staff = {};
  for (const [kind, presets] of Object.entries(ch.staff)) {
    staff[kind] = presets.map((p) => ({
      id: p.id,
      name: p.name,
      weight: p.weight,
      appearance: Object.fromEntries(ch.layerOrder.map((cat) => [cat, resolve(cat, p[cat])])),
    }));
  }
  const withImage = (e) => ({ ...e, image: images.get(e.sheet) ?? null });

  return {
    manifest,
    palette: manifest.palette,
    tileSize: manifest.tile,
    images,
    characters: {
      frame: ch.frame,
      anchor: ch.anchor,
      columns: ch.columns,
      rows: ch.rows,
      animations: ch.animations,
      layerOrder: ch.layerOrder,
      layers,
      patientPools,
      staff,
    },
    robot: withImage(manifest.robot),
    stretcher: withImage(manifest.stretcher),
    shadow: withImage(manifest.shadow),
    objects: Object.fromEntries(Object.entries(manifest.objects).map(([k, e]) => [k, withImage(e)])),
    tiles: { ...manifest.tiles, image: images.get(manifest.tiles.sheet) ?? null },
    emotes: { ...manifest.emotes, image: images.get(manifest.emotes.sheet) ?? null },
  };
}

/**
 * Índice de frame de una animación a los `t` segundos de empezada.
 * Las que no repiten (loop: false) se quedan en el último frame.
 */
export function animFrame(art, anim, t) {
  const a = art.characters.animations[anim];
  if (!a) throw new Error(`animación desconocida: ${anim}`);
  if (a.frames <= 1 || !a.fps) return 0;
  const i = Math.floor(Math.max(0, t) * a.fps);
  return a.loop ? i % a.frames : Math.min(i, a.frames - 1);
}

/** Rectángulo de origen {sx, sy, sw, sh} de un frame de personaje. */
export function characterFrame(art, anim, dir, frame) {
  const ch = art.characters;
  const a = ch.animations[anim];
  if (!a) throw new Error(`animación desconocida: ${anim}`);
  const row = a.rows[dir] ?? a.rows.down;
  const f = Math.min(Math.max(0, frame | 0), a.frames - 1);
  return { sx: f * ch.frame.w, sy: row * ch.frame.h, sw: ch.frame.w, sh: ch.frame.h };
}

/** Rectángulo del frame i de un sprite (objeto, robot, camilla...). */
export function spriteFrame(entry, i = 0) {
  const f = ((i % entry.frames) + entry.frames) % entry.frames;
  return { sx: entry.x + f * entry.frame.w, sy: entry.y, sw: entry.frame.w, sh: entry.frame.h };
}

/**
 * Sprite para una decoración del mapa ({kind, w?, h?, dir?}). Busca, en
 * orden: "kind:dir", "kind@WxH" y "kind". Devuelve null si no hay.
 */
export function objectFor(art, decor) {
  const { kind } = decor;
  const w = decor.w ?? 1;
  const h = decor.h ?? 1;
  const keys = [];
  if (decor.dir) keys.push(`${kind}:${decor.dir}`);
  keys.push(`${kind}@${w}x${h}`, kind);
  for (const k of keys) if (art.objects[k]) return art.objects[k];
  return null;
}

/** Tile por nombre ("piso") o por tipo del mapa ("FLOOR"). */
export function tileFor(art, nameOrType) {
  const name = art.tiles.tiles[nameOrType] ? nameOrType : art.tiles.byType[nameOrType];
  const t = name && art.tiles.tiles[name];
  return t ? { name, ...t, image: art.tiles.image, size: art.tiles.size } : null;
}

/** Rectángulo de un emote por nombre ("alert") o índice. */
export function emoteFrame(art, nameOrIndex) {
  const e = art.emotes;
  const i = typeof nameOrIndex === "number" ? nameOrIndex : e.names[nameOrIndex];
  if (i === undefined || i < 0 || i >= e.count) throw new Error(`emote desconocido: ${nameOrIndex}`);
  return { sx: i * e.frame.w, sy: 0, sw: e.frame.w, sh: e.frame.h };
}
