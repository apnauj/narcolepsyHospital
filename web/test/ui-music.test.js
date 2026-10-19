import { test } from "node:test";
import assert from "node:assert/strict";
import { createMusic, bindMusicButton, musicLabel } from "../js/ui/music.js";

function fakeAudio({ failPlay = false } = {}) {
  const a = {
    plays: 0,
    loop: false,
    volume: 1,
    muted: false,
    src: "",
    addEventListener() {},
    play() {
      a.plays++;
      return failPlay ? Promise.reject(Object.assign(new Error("bloqueado"), { name: "NotAllowedError" })) : Promise.resolve();
    },
  };
  return a;
}

function fakeTarget() {
  const map = new Map();
  return {
    addEventListener: (t, f) => map.set(t, f),
    removeEventListener: (t) => map.delete(t),
    fire: (t) => map.get(t)?.(),
    count: () => map.size,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test("crea un solo Audio en bucle con el volumen pedido", () => {
  let made = 0;
  const a = fakeAudio();
  const m = createMusic({ makeAudio: () => (made++, a), volume: 0.3 });
  assert.equal(made, 1);
  assert.equal(a.loop, true);
  assert.equal(a.volume, 0.3);
  assert.equal(m.played, false);
});

test("arranca tras el primer gesto y suelta los oyentes", async () => {
  const a = fakeAudio();
  const m = createMusic({ makeAudio: () => a });
  const target = fakeTarget();
  m.attachGestures(target);
  assert.ok(target.count() > 0);
  target.fire("keydown");
  await tick();
  assert.equal(a.plays, 1);
  assert.equal(m.played, true);
  assert.equal(target.count(), 0);
});

test("no se reinicia al llamar start otra vez (cambio de escena)", async () => {
  const a = fakeAudio();
  const m = createMusic({ makeAudio: () => a });
  await m.start();
  await m.start();
  assert.equal(a.plays, 1);
});

test("mute, unmute y volumen se aplican al audio", () => {
  const a = fakeAudio();
  const m = createMusic({ makeAudio: () => a });
  assert.equal(m.toggleMute(), true);
  assert.equal(a.muted, true);
  assert.equal(m.toggleMute(), false);
  assert.equal(a.muted, false);
  m.setVolume(0.8);
  assert.equal(a.volume, 0.8);
  m.setVolume(7);
  assert.equal(a.volume, 1);
});

test("un play() rechazado no lanza y se reintenta en el siguiente gesto", async () => {
  const a = fakeAudio({ failPlay: true });
  const m = createMusic({ makeAudio: () => a });
  const target = fakeTarget();
  m.attachGestures(target);
  const warn = console.warn;
  console.warn = () => {};
  try {
    target.fire("click");
    await tick();
    assert.equal(m.played, false);
    assert.ok(target.count() > 0);
    target.fire("click");
    await tick();
    assert.equal(a.plays, 2);
  } finally {
    console.warn = warn;
  }
});

test("si no se puede crear el Audio, la app sigue", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const m = createMusic({ makeAudio: () => { throw new Error("sin audio"); } });
    assert.equal(await m.start(), false);
    m.setVolume(0.2);
    m.toggleMute();
  } finally {
    console.warn = warn;
  }
});

test("subscribe avisa al sonar y al silenciar; etiqueta ♪ / ✕", async () => {
  const m = createMusic({ makeAudio: () => fakeAudio() });
  let n = 0;
  const off = m.subscribe(() => n++);
  await m.start();
  m.toggleMute();
  assert.equal(n, 2);
  off();
  m.toggleMute();
  assert.equal(n, 2);
  assert.equal(musicLabel(false), "♪");
  assert.equal(musicLabel(true), "✕");
  assert.equal(typeof bindMusicButton, "function");
});
