/**
 * audio.mjs — the shop floor's sound. Procedural WebAudio. No assets.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * §13, VERBATIM FROM THE BRIEF: "Do not make all machining sound like generic
 * metallic grinding."
 * ═════════════════════════════════════════════════════════════════════════════
 * That sentence is the whole specification for this file, and it is why there
 * is no sample library here. A looping grinding clip is exactly the failure the
 * brief names. Instead every sound in this shop is SYNTHESISED from the numbers
 * the kernel is already computing for that machine at that moment:
 *
 *   IDLE       bearing whine + motor hum at 1x rev. Tracks rpm, NOT load.
 *   CUT        an impulse train at n*z/60 Hz (the tooth-passing frequency),
 *              plus broadband friction noise. The RATIO of the two is the
 *              physics: a heavy bite is all impulse, a light finishing pass is
 *              mostly hiss.
 *   RUB        no impulse train at all. Narrowband high squeal. The kernel
 *              refuses a pass with no effective engagement and calls it
 *              RUBBING; that refusal is what this sound is.
 *   CHATTER    the bar's own natural frequency (fn_Hz from the kernel machine),
 *              amplitude-modulated at the tooth frequency. A regenerative
 *              instability is a tone AND a beat, and you can hear the beat.
 *   COOLANT    filtered noise, not white noise: a low rumble plus a sizzle
 *              band. Flood coolant hitting a hot chip is broadband as it hits
 *              and quiet once it is flooded.
 *   AIR        compressed air is a jet: high-passed noise. It is one of the
 *              loudest things in a shop and the brief names it explicitly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 * It does not decide what a machine is doing. `world.mjs` (from kernel numbers)
 * decides that; this file is only the transducer. That separation is what makes
 * §13 verifiable instead of a vibe: you can log the acoustics object and check
 * it against the cut record.
 *
 * §13 also asks for perspective attenuation and occlusion, which arrive in
 * `setListener` / `voice` and are applied per-source by distance and by whether
 * the line to the source passes through a wall or a machine enclosure.
 * ═════════════════════════════════════════════════════════════════════════════
 */

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export const SPEED_OF_SOUND_M_PER_S = 343;

/** Distance at which a sound is at reference level, and the rolloff beyond it.
 *  Inverse-distance with a floor: a shop is reverberant, so distant machines
 *  do NOT vanish, they blur. Reverb is faked with the tail, not a convolver —
 *  a convolver would need an impulse response asset, and §13 prefers synthesis. */
const REF_DIST_M = 2.2;

export function attenuation(distance_m, { walls = 0, enclosure = 0 } = {}) {
  const direct = REF_DIST_M / Math.max(REF_DIST_M, distance_m);
  /* 6 dB per wall, 10 dB for being inside a closed machine enclosure. */
  const barrier = Math.pow(0.5, walls) * Math.pow(0.32, enclosure);
  return clamp(direct * barrier, 0, 1);
}

/** Air delay, seconds. At 10 m that is 29 ms — audible as "far away" and one of
 *  the cheapest, most convincing cues available. */
export const delayFor = (distance_m) => Math.max(0, distance_m) / SPEED_OF_SOUND_M_PER_S;

/* ══════════════════════════════════════════════════════════════════════════════
   THE ENGINE
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── `context` IS FOR VERIFICATION AND NOTHING ELSE ────────────────────────
   Pass an OfflineAudioContext and the whole audio graph builds inside it, so a
   test can drive the shop through a scene and RENDER it, then measure what came
   out. That is the only way this project can check sound without ears: the
   brief's Gate A asks "does the machine sound right", no human has ever heard
   this build, and "it should work" is not evidence.

   It changes nothing when omitted — the page passes no context and gets the
   same interactive AudioContext it always did. */
export function createAudio({ busy = false, context = null } = {}) {
  let ctx = null;
  let master = null;
  const voices = new Map();          // id -> voice
  let started = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC && !context) return null;
    ctx = context || new AC({ latencyHint: 'interactive' });

    master = ctx.createGain();
    master.gain.value = 0.9;

    /* A small amount of global compression. A real shop is LOUD and the ear
       hears the loudest thing; without this, ten machines sum into mush and
       the player cannot pick out the one they care about. This is the mix
       decision that makes §53's "industrial perception" audible. */
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 14;
    comp.ratio.value = 5;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;

    master.connect(comp).connect(ctx.destination);
    return ctx;
  }

  /* ── noise source: one shared buffer, reused by every noise-based voice ──
     White noise is a poor model of anything in a machine shop. Moving air,
     coolant and a cutting edge all have SPECTRAL SHAPE, so the buffer is
     filtered per-voice rather than per-buffer. */
  let noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    const n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    /* A cheap 1/f tilt in the source itself, so the "white" layer already has
       weight when it reaches a plain filter. */
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.32 + w * 0.68;
      d[i] = last;
    }
    return noiseBuf;
  }

  function noiseSource(loop = true) {
    const s = ctx.createBufferSource();
    s.buffer = noise();
    s.loop = loop;
    return s;
  }

  /* Ambience beds that must exist even with no machine in earshot: HVAC,
     the building, the yard. §1: the factory exists whether or not you act. */
  let roomGain = null;

  function start() {
    if (!ensure()) return false;
    if (started) return true;
    started = true;

    /* An OfflineAudioContext starts 'suspended' too, and resume() on one is a
       no-op that some implementations reject — so the state is checked and the
       call is guarded, because a throw here would take the whole graph down
       before a single sample was scheduled. */
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function' && !ctx.startRendering) {
      try { ctx.resume(); } catch (e) { /* offline contexts do not need it */ }
    }

    /* ROOM TONE — a large industrial building. Two octaves of low rumble plus
       a very quiet high hiss (HVAC + lighting). Present always, at low level:
       this is what makes the silence when a machine stops feel like silence. */
    roomGain = ctx.createGain();
    roomGain.gain.value = 0.0;
    roomGain.connect(master);
    roomGain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 3.0);

    const rum = noiseSource();
    const rumLP = ctx.createBiquadFilter();
    rumLP.type = 'lowpass'; rumLP.frequency.value = 110; rumLP.Q.value = 0.7;
    const rumG = ctx.createGain(); rumG.gain.value = 0.55;
    rum.connect(rumLP).connect(rumG).connect(roomGain);

    /* 50 Hz electrical hum — the mains. It is there in every real shop and it
       is the single best cue that you are standing indoors in a building with
       big motors in it. */
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth'; hum.frequency.value = 50;
    const humLP = ctx.createBiquadFilter();
    humLP.type = 'lowpass'; humLP.frequency.value = 160;
    const humG = ctx.createGain(); humG.gain.value = 0.018;
    hum.connect(humLP).connect(humG).connect(roomGain);

    rum.start(); hum.start();
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MACHINE VOICE — one per machine, persistent, retuned every frame.
     ══════════════════════════════════════════════════════════════════════════
     A voice is not a one-shot. It is a set of continuously running generators
     whose gains and frequencies are set from the kernel each frame. That is
     why a machine can be heard CHANGING — speeding up, loading up, going from
     cutting to rubbing — rather than restarting a clip.
     ══════════════════════════════════════════════════════════════════════════ */

  function machineVoice(id) {
    if (voices.has(id)) return voices.get(id);
    if (!ensure()) return null;

    /* ══ THIS GAIN WAS ZERO AND NOTHING EVER RAISED IT ═══════════════════════
       Every generator in this function — the bearing whine, the 1x and 2x
       spindle tones, the impulse train, the rub, the chatter — routes through
       `out` and `out` connects to the master. With `out.gain` at 0 the whole
       machine voice was silent, and it had been silent since it was written.

       MEASURED, not deduced. `tools/audio-probe.html` renders each scene offline
       through an OfflineAudioContext and compares it against the room tone
       alone. Every machine scene came back within 8 % of the room:

           a clean cut         0.935 x the room
           idle spindle        0.954 x
           chattering          1.006 x
           a cut 14 m away     0.923 x

       So a player has only ever heard the building — the HVAC rumble, the mains
       hum, one-shot clacks and footsteps. Four machines, one compressor and a
       radio with a working synthesis graph and no sound coming out of any of
       them, and nothing in the game said so, because there is nothing to say it.

       WHY IT SURVIVED: this is the same species as `M.iron`, `job.depth_mm` and
       `describeBore` — a correct thing that is never connected — and it is the
       one of the four that no screenshot and no unit test could ever have shown,
       because its only symptom is silence and its only evidence is a measurement.

       THE SUB-GAINS BELOW WERE TUNED AGAINST A SILENT OUTPUT, so their relative
       balance is unverified: nobody has heard any of it. They are left exactly as
       written and the probe now reports what they actually produce. */
    const out = ctx.createGain();
    out.gain.value = 1.0;
    out.connect(master);

    /* Spindle whine — bearing noise. Band-passed noise around a tone that
       tracks rpm. */
    const whineG = ctx.createGain(); whineG.gain.value = 0;
    const whineBP = ctx.createBiquadFilter();
    whineBP.type = 'bandpass'; whineBP.frequency.value = 900; whineBP.Q.value = 3.5;
    const whineSrc = noiseSource();
    whineSrc.connect(whineBP).connect(whineG).connect(out);

    /* The spindle TONE itself: a real spindle has a harmonic at 1x and 2x rev
       because it is never perfectly balanced. Two oscillators, not noise. */
    const tone1 = ctx.createOscillator(); tone1.type = 'sine'; tone1.frequency.value = 60;
    const tone1G = ctx.createGain(); tone1G.gain.value = 0;
    const tone2 = ctx.createOscillator(); tone2.type = 'sine'; tone2.frequency.value = 120;
    const tone2G = ctx.createGain(); tone2G.gain.value = 0;
    tone1.connect(tone1G).connect(out);
    tone2.connect(tone2G).connect(out);

    /* THE CUT — the impulse train. A pulse oscillator at the tooth-passing
       frequency. Its amplitude is the chip load; its frequency is n*z/60. This
       is the single most important generator in the file, because it is what
       makes a cut sound like a CUT and not a grind. */
    const cutOsc = ctx.createOscillator(); cutOsc.type = 'sawtooth';
    cutOsc.frequency.value = 120;
    const cutLP = ctx.createBiquadFilter();
    cutLP.type = 'lowpass'; cutLP.frequency.value = 1400; cutLP.Q.value = 1.1;
    const cutBP = ctx.createBiquadFilter();
    cutBP.type = 'bandpass'; cutBP.frequency.value = 320; cutBP.Q.value = 0.8;
    const cutG = ctx.createGain(); cutG.gain.value = 0;
    cutOsc.connect(cutLP).connect(cutBP).connect(cutG).connect(out);

    /* The friction layer: material sliding over the edge. Broadband, and it is
       what dominates a light finishing cut. */
    const rubG = ctx.createGain(); rubG.gain.value = 0;
    const rubHP = ctx.createBiquadFilter();
    rubHP.type = 'highpass'; rubHP.frequency.value = 1800;
    const rubSrc = noiseSource();
    rubSrc.connect(rubHP).connect(rubG).connect(out);

    /* CHATTER: the bar's own natural frequency, ring-modulated by the tooth
       frequency. A regenerative instability is a tone and a beat, and both are
       audible. Given its own narrow filter so it cuts through everything else. */
    const chatOsc = ctx.createOscillator(); chatOsc.type = 'triangle';
    chatOsc.frequency.value = 1000;
    const chatAM = ctx.createGain(); chatAM.gain.value = 1;      // modulated below
    const chatBP = ctx.createBiquadFilter();
    chatBP.type = 'bandpass'; chatBP.frequency.value = 1000; chatBP.Q.value = 9;
    const chatG = ctx.createGain(); chatG.gain.value = 0;
    chatOsc.connect(chatAM).connect(chatBP).connect(chatG).connect(out);
    const chatMod = ctx.createOscillator(); chatMod.type = 'sine'; chatMod.frequency.value = 60;
    const chatModG = ctx.createGain(); chatModG.gain.value = 0.75;
    chatMod.connect(chatModG).connect(chatAM.gain);

    /* COOLANT: flood coolant is a low rumble (the pump and the flow) plus a
       splash band. Not white noise — real coolant has a pitch you can hear
       change when a nozzle is knocked out of alignment. */
    const coolG = ctx.createGain(); coolG.gain.value = 0;
    const coolLP = ctx.createBiquadFilter(); coolLP.type = 'lowpass'; coolLP.frequency.value = 700;
    const coolSrc = noiseSource();
    const coolPump = ctx.createOscillator(); coolPump.type = 'sine'; coolPump.frequency.value = 88;
    const coolPumpG = ctx.createGain(); coolPumpG.gain.value = 0.25;
    coolSrc.connect(coolLP).connect(coolG).connect(out);
    coolPump.connect(coolPumpG).connect(coolG);

    /* COMPRESSED AIR: a jet. High-passed noise with a narrow resonance — the
       harshest, most directional sound in the shop. */
    const airG = ctx.createGain(); airG.gain.value = 0;
    const airHP = ctx.createBiquadFilter(); airHP.type = 'highpass'; airHP.frequency.value = 2600;
    const airRes = ctx.createBiquadFilter();
    airRes.type = 'peaking'; airRes.frequency.value = 5200; airRes.Q.value = 2.0; airRes.gain.value = 9;
    const airSrc = noiseSource();
    airSrc.connect(airHP).connect(airRes).connect(airG).connect(out);

    /* Compressed-air BURSTS (a blow-off gun), scheduled, not looping. */
    const airBurstG = ctx.createGain(); airBurstG.gain.value = 0;
    const airBurstHP = ctx.createBiquadFilter(); airBurstHP.type = 'highpass'; airBurstHP.frequency.value = 2200;
    const airBurstSrc = noiseSource();
    airBurstSrc.connect(airBurstHP).connect(airBurstG).connect(master);

    for (const s of [whineSrc, rubSrc, coolSrc, airSrc, airBurstSrc]) s.start();
    for (const o of [tone1, tone2, cutOsc, chatOsc, chatMod, coolPump]) o.start();

    const v = {
      id, out, whineG, whineBP, tone1, tone1G, tone2, tone2G,
      cutOsc, cutG, cutLP, cutBP, rubG, rubHP,
      chatOsc, chatG, chatBP, chatMod, chatModG,
      coolG, coolPump, airG, airBurstG, airBurstSrc,
      pan: null,
    };
    /* A stereo panner so a machine on your left is on your left. Positional
       audio without a PannerNode's HRTF cost — this is an integrated GPU. */
    v.pan = ctx.createStereoPanner();
    out.disconnect();
    out.connect(v.pan).connect(master);
    voices.set(id, v);
    return v;
  }

  let lastAir = 0;

  /**
   * Set a machine's whole acoustic state for this frame.
   *
   * @param {string} id
   * @param {object} a      acoustics from world.mjs cutAcoustics/idleAcoustics
   * @param {object} opts   { gain, pan, distance_m, walls, enclosure, chatter_Hz,
   *                          coolant, air, load }
   */
  function setMachine(id, a, opts = {}) {
    if (!started) return;
    const v = machineVoice(id);
    if (!v) return;

    const t = ctx.currentTime;
    const tau = 0.06;                                  // smoothing: no zipper noise
    const at = (param, value) => param.setTargetAtTime(value, t, tau);

    const gain = (opts.gain ?? 1) * attenuation(opts.distance_m ?? 4, opts);
    at(v.pan.pan, clamp(opts.pan ?? 0, -1, 1));

    const state = a?.state ?? 'STOPPED';

    /* --- spindle tone: present whenever the spindle turns, cutting or not --- */
    const hz = a?.spindle_Hz ?? 0;
    const on = hz > 0;
    at(v.tone1.frequency, clamp(hz, 20, 12000));
    at(v.tone2.frequency, clamp(hz * 2, 40, 16000));
    at(v.tone1G.gain, on ? 0.035 * gain : 0);
    at(v.tone2G.gain, on ? 0.014 * gain : 0);
    at(v.whineBP.frequency, clamp(hz * 14, 200, 9000));
    at(v.whineG.gain, on ? (0.05 + 0.10 * clamp(hz / 160, 0, 1)) * gain : 0);

    /* --- cut / rub / chatter: mutually exclusive, by physics not by taste --- */
    const cutting = ['CUTTING', 'FINISHING', 'ROUGHING', 'OVERLOADED'].includes(state);
    const rubbing = state === 'RUBBING';
    const chattering = state === 'CHATTER';

    if (cutting || chattering) {
      const tooth = clamp(a.tooth_Hz || 60, 8, 6000);
      at(v.cutOsc.frequency, tooth);
      at(v.cutLP.frequency, clamp(600 + tooth * 5.5, 400, 9000));
      at(v.cutBP.frequency, clamp(140 + tooth * 1.6, 90, 5000));
      /* Impulse strength: this is the harmonic_gain world.mjs derived from the
         kernel's PEAK force. A whisper-light pass is nearly pure friction. */
      const imp = a.harmonic_gain ?? 0.5;
      at(v.cutG.gain, (0.10 + 0.30 * imp) * gain * (chattering ? 0.45 : 1));
      at(v.rubG.gain, (0.03 + 0.14 * (a.noise_gain ?? 0.5)) * gain);
      at(v.rubHP.frequency, clamp(1200 + tooth * 2.4, 600, 7000));
    } else if (rubbing) {
      /* NO impulse train. That absence is the whole sound. */
      at(v.cutG.gain, 0);
      at(v.rubG.gain, 0.22 * gain);
      at(v.rubHP.frequency, clamp(a.squeal_Hz ?? 1900, 800, 7000));
      /* A rub is narrowband; add a thin tone so it reads as a squeal and not
         as hiss. This is the sound of an insert about to die. */
      at(v.chatBP.frequency, clamp(a.squeal_Hz ?? 1900, 400, 8000));
      at(v.chatOsc.frequency, clamp(a.squeal_Hz ?? 1900, 400, 8000));
      at(v.chatG.gain, 0.10 * gain);
    } else {
      at(v.cutG.gain, 0);
      at(v.rubG.gain, 0);
      at(v.chatG.gain, 0);
    }

    if (chattering) {
      /* The bar's own natural frequency, from the kernel's machine model. The
         beat between this tone and the tooth frequency is what a machinist
         hears and calls "the bar is singing". */
      const fn = clamp(opts.chatter_Hz ?? 1000, 120, 8000);
      at(v.chatOsc.frequency, fn);
      at(v.chatBP.frequency, fn);
      at(v.chatMod.frequency, clamp(a.tooth_Hz || 60, 8, 6000));
      at(v.chatG.gain, 0.22 * gain);
    }

    at(v.coolG.gain, opts.coolant ? 0.16 * gain : 0);
    at(v.coolPump.frequency, 78 + 26 * clamp(a.rpm / 6000, 0, 1));
    at(v.airG.gain, opts.air ? 0.10 * gain : 0);

    /* --- blow-off bursts: topped up by the caller, not a timer here --- */
    if (opts.air_burst && ctx.currentTime - lastAir > 1.2) {
      lastAir = ctx.currentTime;
      airBurstSchedule(v, clamp(opts.distance_m ?? 6, 1, 40));
    }
    at(v.airBurstG.gain, 0);
  }

  function airBurstSchedule(v, distance_m) {
    /* A real blow-off gun is held for a second or two — it is a person, not a
       machine, so it starts and stops abruptly. The air delay is applied
       because at 20 m you see the hand move before you hear it. */
    const t0 = ctx.currentTime + delayFor(distance_m);
    const dur = 0.9 + Math.random() * 1.4;
    const g = v.airBurstG.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(0.11 * attenuation(distance_m), t0 + 0.012);
    g.setValueAtTime(0.10 * attenuation(distance_m), t0 + dur - 0.05);
    g.linearRampToValueAtTime(0, t0 + dur);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ONE-SHOTS — things that happen, rather than things that run
     ══════════════════════════════════════════════════════════════════════════ */

  /** A machine starting a cycle: the spindle spins up. Not a click — a ramp. */
  function spindleStart(id, { to_Hz = 120, seconds = 2.2 } = {}) {
    if (!started) return;
    const v = machineVoice(id); if (!v) return;
    const t = ctx.currentTime;
    v.tone1.frequency.cancelScheduledValues(t);
    v.tone1.frequency.setValueAtTime(Math.max(20, v.tone1.frequency.value), t);
    v.tone1.frequency.exponentialRampToValueAtTime(to_Hz, t + seconds);
    v.tone2.frequency.setValueAtTime(Math.max(40, v.tone2.frequency.value), t);
    v.tone2.frequency.exponentialRampToValueAtTime(to_Hz * 2, t + seconds);
  }

  /** A tool entering the cut. One thump: a short burst of the cut oscillator
   *  at the instantaneous tooth frequency, then the steady layer takes over. */
  function cutEnter(id, { tooth_Hz = 60, gain = 0.3 } = {}) {
    if (!started) return;
    const v = machineVoice(id); if (!v) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(clamp(tooth_Hz, 8, 6000), t);
    o.frequency.exponentialRampToValueAtTime(clamp(tooth_Hz * 0.7, 8, 6000), t + 0.09);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(f).connect(g).connect(master);
    o.start(t); o.stop(t + 0.2);
  }

  /** CHIPS falling into the sump / onto the tray. Metallic tinkles with a
   *  random pitch — the sound of a machine that has been running all week. */
  function chipFall(near = 1) {
    if (!started) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const f = 1400 + Math.random() * 2600;
      o.frequency.setValueAtTime(f, t + i * 0.05);
      const g = ctx.createGain();
      const at = t + i * 0.05 + Math.random() * 0.06;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.02 * near, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      o.connect(g).connect(master);
      o.start(at); o.stop(at + 0.12);
    }
  }

  /** A FOOTSTEP. Boots on a concrete shop floor: a low thump plus a scuff. */
  function footstep({ gain = 1, surface = 'concrete' } = {}) {
    if (!started) return;
    const t = ctx.currentTime;
    const src = noiseSource(false);
    const f = ctx.createBiquadFilter();
    f.type = surface === 'concrete' ? 'lowpass' : 'bandpass';
    f.frequency.value = surface === 'concrete' ? 380 : 1600;
    f.Q.value = surface === 'concrete' ? 0.9 : 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13 * gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (surface === 'concrete' ? 0.14 : 0.08));
    src.connect(f).connect(g).connect(master);
    src.start(t); src.stop(t + 0.2);
  }

  /** A HAND TOOL: the rattle of a wrench, the clack of a clamp, the ring of a
   *  part set down on steel. Distinct from a machine, and short. */
  function clack({ gain = 1, pitch = 900, kind = 'steel' } = {}) {
    if (!started) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(pitch, t);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.55, t + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = pitch * 1.2; f.Q.value = 2.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.10 * gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'steel' ? 0.22 : 0.08));
    o.connect(f).connect(g).connect(master);
    o.start(t); o.stop(t + 0.3);
  }

  /** The nearest machine finishing its cycle — the beep nobody is fixing.
   *  §1 asks for it by name. A 2 kHz square with a hard envelope: cheap,
   *  insistent, and exactly what a Fanuc control sounds like. */
  function controlBeep({ gain = 0.5, hz = 2050 } = {}) {
    if (!started) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square'; o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035 * gain, t + 0.006);
    g.gain.setValueAtTime(0.035 * gain, t + 0.13);
    g.gain.linearRampToValueAtTime(0, t + 0.16);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.2);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LISTENER
     ══════════════════════════════════════════════════════════════════════════ */

  function setListener(pos, forward) {
    if (!ctx) return;
    const l = ctx.listener;
    const t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(forward.x, t, 0.02);
      l.forwardY.setTargetAtTime(forward.y, t, 0.02);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.02);
      l.upX.setTargetAtTime(0, t, 0.02);
      l.upY.setTargetAtTime(1, t, 0.02);
      l.upZ.setTargetAtTime(0, t, 0.02);
    } else if (l.setPosition) {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  return {
    start, get ready() { return started; },
    get context() { return ctx; },
    setMachine, machineVoice, setListener,
    spindleStart, cutEnter, chipFall, footstep, clack, controlBeep, airBurst: (id, o) => setMachine(id, null, { ...o, air_burst: true }),
    setMuted(m) { if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05); },
    /* §13 asks for a damped but PRESENT bed. Also lets the world duck the shop
       for the few seconds when someone is speaking to you — which is what a
       real person does when they lean in. */
    duck(amount = 0.45, seconds = 0.4) {
      if (!master) return;
      master.gain.setTargetAtTime(0.9 * amount, ctx.currentTime, seconds / 3);
      master.gain.setTargetAtTime(0.9, ctx.currentTime + seconds, 0.5);
    },
  };
}
