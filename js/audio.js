/* Operation: Best Human — procedural audio (no audio files needed) */
(() => {
  'use strict';
  let ctx = null, master, musicBus, sfxBus, noiseBuf;
  const vol = { music: 0.55, sfx: 0.8 };
  let mood = null, timer = null, step = 0, nextTime = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = vol.music * 0.32; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
    // simple reverb send for music
    const verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    verb.buffer = ir; const vg = ctx.createGain(); vg.gain.value = 0.35;
    musicBus.connect(verb).connect(vg).connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function tone({ f = 440, t = 0, d = 0.2, type = 'sine', g = 0.3, bus = sfxBus, a = 0.005, slide = 0, q = 0, cutoff = 0 }) {
    if (!ctx) return;
    const now = ctx.currentTime + t;
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, now);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), now + d);
    gn.gain.setValueAtTime(0.0001, now);
    gn.gain.exponentialRampToValueAtTime(g, now + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, now + d);
    let node = o;
    if (cutoff) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff; fl.Q.value = q; o.connect(fl); node = fl; }
    node.connect(gn).connect(bus);
    o.start(now); o.stop(now + d + 0.05);
  }

  function noise({ t = 0, d = 0.3, g = 0.3, from = 800, to = 800, type = 'bandpass', q = 1, bus = sfxBus, a = 0.01 }) {
    if (!ctx) return;
    const now = ctx.currentTime + t;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(from, now); fl.frequency.exponentialRampToValueAtTime(Math.max(40, to), now + d);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, now); gn.gain.exponentialRampToValueAtTime(g, now + a); gn.gain.exponentialRampToValueAtTime(0.0001, now + d);
    s.connect(fl).connect(gn).connect(bus); s.start(now); s.stop(now + d + 0.05);
  }

  const SFX = {
    click: () => tone({ f: 900, d: 0.05, type: 'triangle', g: 0.12 }),
    hover: () => tone({ f: 1400, d: 0.03, type: 'sine', g: 0.04 }),
    blip: (p = 400) => tone({ f: p * (0.95 + Math.random() * 0.1), d: 0.045, type: 'square', g: 0.035, cutoff: 2400 }),
    clue: () => { [72, 76, 79, 84].forEach((m, i) => tone({ f: hz(m), t: i * 0.07, d: 0.5, type: 'triangle', g: 0.16 })); tone({ f: hz(96), t: 0.28, d: 0.6, g: 0.05 }); },
    wrong: () => { tone({ f: 180, d: 0.45, type: 'sawtooth', g: 0.12, slide: 0.55, cutoff: 900 }); tone({ f: 120, t: 0.05, d: 0.5, type: 'square', g: 0.06, slide: 0.6, cutoff: 600 }); },
    objection: () => { tone({ f: hz(64), d: 0.18, type: 'sawtooth', g: 0.14, cutoff: 3000 }); tone({ f: hz(71), t: 0.09, d: 0.35, type: 'sawtooth', g: 0.14, cutoff: 3000 }); noise({ d: 0.25, g: 0.2, from: 3000, to: 600 }); },
    tick: () => { noise({ d: 0.04, g: 0.25, from: 4000, to: 3000, q: 4 }); tone({ f: 1800, d: 0.03, g: 0.05 }); },
    tock: () => { noise({ d: 0.05, g: 0.25, from: 2000, to: 1500, q: 4 }); },
    boom: () => { tone({ f: 90, d: 1.2, g: 0.5, slide: 0.35 }); noise({ d: 1.4, g: 0.35, from: 900, to: 80, type: 'lowpass' }); },
    whoosh: () => noise({ d: 1.6, g: 0.28, from: 200, to: 3000, q: 0.8, a: 0.5 }),
    hiss: () => noise({ d: 3.2, g: 0.18, from: 5000, to: 1500, type: 'highpass', a: 0.3 }),
    door: () => { tone({ f: 70, d: 0.35, g: 0.35, slide: 0.7 }); noise({ d: 0.2, g: 0.15, from: 500, to: 200, type: 'lowpass' }); },
    creak: () => { tone({ f: 260, d: 0.9, type: 'sawtooth', g: 0.05, slide: 1.6, cutoff: 1200, q: 8 }); },
    unlock: () => { tone({ f: 1200, d: 0.04, type: 'square', g: 0.06 }); tone({ f: 900, t: 0.08, d: 0.05, type: 'square', g: 0.06 }); [79, 84, 88].forEach((m, i) => tone({ f: hz(m), t: 0.2 + i * 0.08, d: 0.5, type: 'triangle', g: 0.12 })); },
    key: () => tone({ f: 660 + Math.random() * 200, d: 0.06, type: 'square', g: 0.05, cutoff: 3000 }),
    deny: () => { tone({ f: 220, d: 0.12, type: 'square', g: 0.08 }); tone({ f: 220, t: 0.16, d: 0.18, type: 'square', g: 0.08 }); },
    shutter: () => { noise({ d: 0.06, g: 0.4, from: 6000, to: 3000 }); noise({ t: 0.08, d: 0.05, g: 0.3, from: 4000, to: 2000 }); },
    page: () => noise({ d: 0.18, g: 0.12, from: 1500, to: 4000, q: 0.6 }),
    sting: () => { [57, 60, 63, 66].forEach((m, i) => tone({ f: hz(m), t: i * 0.04, d: 1.6, type: 'sawtooth', g: 0.06, cutoff: 1800 })); tone({ f: hz(33), d: 2, g: 0.3 }); },
    reveal: () => { [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone({ f: hz(m), t: i * 0.09, d: 1.4, type: 'triangle', g: 0.1 })); noise({ t: 0.5, d: 2.4, g: 0.05, from: 6000, to: 9000, type: 'highpass' }); },
    fanfare: () => {
      const n = [[67, 0], [72, 0.18], [76, 0.36], [79, 0.54], [76, 0.84], [79, 1.02], [84, 1.2]];
      n.forEach(([m, t]) => { tone({ f: hz(m), t, d: 0.5, type: 'sawtooth', g: 0.07, cutoff: 2600 }); tone({ f: hz(m - 12), t, d: 0.5, type: 'triangle', g: 0.08 }); });
      [48, 52, 55, 60].forEach(m => tone({ f: hz(m), t: 1.2, d: 2.2, type: 'triangle', g: 0.08 }));
    },
    sad: () => { [64, 63, 62, 59].forEach((m, i) => tone({ f: hz(m), t: i * 0.35, d: 0.6, type: 'triangle', g: 0.12 })); },
    cheer: () => { for (let i = 0; i < 14; i++) noise({ t: i * 0.06, d: 0.9, g: 0.08, from: 900 + Math.random() * 1500, to: 600, q: 2 }); },
    clink: () => { tone({ f: 2400, d: 0.6, g: 0.1 }); tone({ f: 3150, d: 0.5, g: 0.06 }); tone({ f: 2420, t: 0.12, d: 0.7, g: 0.08 }); },
    // cinematic intro hits
    thud: (k = 1) => { tone({ f: 62 * k, d: 0.55, g: 0.55, slide: 0.45 }); noise({ d: 0.18, g: 0.22, from: 700, to: 90, type: 'lowpass' }); tone({ f: 1800 * k, d: 0.05, type: 'square', g: 0.02, cutoff: 3000 }); },
    heartbeat: () => { tone({ f: 55, d: 0.28, g: 0.5, slide: 0.6 }); tone({ f: 50, t: 0.22, d: 0.32, g: 0.38, slide: 0.6 }); },
    riser: (d = 2) => { noise({ d, g: 0.22, from: 250, to: 7000, q: 1.4, a: d * 0.95 }); tone({ f: 110, d, type: 'sawtooth', g: 0.05, slide: 4, cutoff: 2400, a: d * 0.9 }); tone({ f: 165, d, type: 'sawtooth', g: 0.035, slide: 4, cutoff: 2400, a: d * 0.9 }); },
    impact: () => {
      tone({ f: 48, d: 2.6, g: 0.7, slide: 0.4 }); tone({ f: 96, d: 1.2, type: 'triangle', g: 0.3, slide: 0.5 });
      noise({ d: 2.2, g: 0.45, from: 2400, to: 60, type: 'lowpass', a: 0.003 }); noise({ d: 0.5, g: 0.2, from: 8000, to: 3000, type: 'highpass', a: 0.002 });
      [45, 52, 57, 60, 64].forEach(m => tone({ f: hz(m), d: 4.5, type: 'sawtooth', g: 0.035, cutoff: 1400, a: 0.02 }));
      tone({ f: hz(93), t: 0.05, d: 3.5, g: 0.04 }); tone({ f: hz(100), t: 0.1, d: 3.2, g: 0.025 });
    },
    teletype: () => { noise({ d: 0.025, g: 0.2, from: 5000, to: 3500, q: 3 }); tone({ f: 2200 + Math.random() * 400, d: 0.02, type: 'square', g: 0.015 }); },
    siren: () => { for (let i = 0; i < 3; i++) { tone({ f: 640, t: i * 0.9, d: 0.45, type: 'sine', g: 0.025, slide: 1.35, a: 0.1 }); tone({ f: 860, t: i * 0.9 + 0.45, d: 0.45, type: 'sine', g: 0.025, slide: 0.75, a: 0.05 }); } },
    crackle: () => { for (let i = 0; i < 10; i++) noise({ t: i * 0.05, d: 0.05, g: 0.12, from: 2000 + Math.random() * 3000, to: 1500 }); },
  };

  // ---------- music ----------
  // Each mood: tempo, bass line, arpeggio chords (midi), hat density
  const MOODS = {
    title:    { bpm: 84, chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]], bass: [45, 41, 43, 40], lead: 'triangle', hat: 0, bell: true },
    mystery:  { bpm: 96, chords: [[57, 60, 64], [57, 60, 65], [55, 58, 62], [52, 55, 59]], bass: [45, 45, 43, 40], lead: 'triangle', hat: 0.5, bell: false },
    tension:  { bpm: 120, chords: [[57, 60, 63], [57, 60, 63], [56, 59, 62], [56, 59, 62]], bass: [45, 45, 44, 44], lead: 'sawtooth', hat: 1, bell: false, pulse: true },
    jake:     { bpm: 112, chords: [[60, 64, 67], [57, 60, 64], [62, 65, 69], [55, 59, 62]], bass: [48, 45, 50, 43], lead: 'square', hat: 1, bell: false },
    victory:  { bpm: 104, chords: [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]], bass: [48, 53, 55, 48], lead: 'triangle', hat: 1, bell: true },
    intro:    { bpm: 68, chords: [[45, 48, 52], [44, 48, 51], [41, 45, 48], [40, 44, 47]], bass: [33, 32, 29, 28], lead: 'sine', hat: 0, bell: true, pulse: true },
    sad:      { bpm: 70, chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], bass: [45, 41, 38, 40], lead: 'sine', hat: 0, bell: false },
  };

  function schedule() {
    if (!ctx || !mood) return;
    const m = MOODS[mood], spb = 60 / m.bpm / 2; // eighth notes
    while (nextTime < ctx.currentTime + 0.25) {
      const bar = Math.floor(step / 8) % 4, s = step % 8, ch = m.chords[bar];
      const t = nextTime - ctx.currentTime;
      if (s === 0 || (m.pulse && s % 2 === 0)) tone({ f: hz(m.bass[bar] - 12), t, d: m.pulse ? spb * 1.6 : spb * 7, type: 'triangle', g: 0.32, bus: musicBus, a: 0.02 });
      if (s === 0 && !m.pulse) tone({ f: hz(m.bass[bar]), t, d: spb * 8, type: 'sine', g: 0.12, bus: musicBus, a: 0.3 });
      const arp = [0, 1, 2, 1, 0, 2, 1, 2][s];
      tone({ f: hz(ch[arp] + (s >= 4 ? 12 : 0)), t, d: spb * 1.8, type: m.lead, g: m.lead === 'triangle' || m.lead === 'sine' ? 0.1 : 0.035, bus: musicBus, cutoff: m.lead === 'triangle' || m.lead === 'sine' ? 0 : 1600 });
      if (m.bell && s === 4 && bar % 2 === 1) tone({ f: hz(ch[2] + 24), t, d: 1.6, type: 'sine', g: 0.05, bus: musicBus });
      if (m.hat && (s % 2 === 1 || m.hat > 0.8)) noise({ t, d: 0.04, g: s % 4 === 2 ? 0.05 : 0.025, from: 8000, to: 7000, type: 'highpass', bus: musicBus });
      if (m.hat > 0.8 && s % 4 === 0) noise({ t, d: 0.12, g: 0.07, from: 160, to: 60, type: 'lowpass', bus: musicBus });
      nextTime += spb; step++;
    }
  }

  const Audio = {
    vol,
    init,
    sfx(name, arg) { try { init(); SFX[name] && SFX[name](arg); } catch (e) { /* audio is optional */ } },
    music(name) {
      init(); if (!ctx || mood === name) return;
      const prev = mood; mood = name;
      if (!name) { clearInterval(timer); timer = null; return; }
      if (prev) { musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setValueAtTime(0.0001, ctx.currentTime); musicBus.gain.linearRampToValueAtTime(vol.music * 0.32, ctx.currentTime + 1.2); }
      step = 0; nextTime = ctx.currentTime + 0.1;
      if (!timer) timer = setInterval(schedule, 60);
    },
    stopMusic() { mood = null; clearInterval(timer); timer = null; },
    setVolume(kind, v) {
      vol[kind] = v;
      if (!ctx) return;
      if (kind === 'music') musicBus.gain.value = v * 0.32; else sfxBus.gain.value = v;
    },
  };
  window.HeistAudio = Audio;
})();
