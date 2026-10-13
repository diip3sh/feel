/*! Feel runtime v0.1 · MIT
 *
 * Interactions built on physics. Every motion comes from a physical model:
 * a body with mass, a spring with stiffness, damping, and optional force fields
 * (magnets, friction, walls). There are no durations and no easing curves.
 * A drag is a force too: the pointer pulls the body through a "hand" spring,
 * so a heavy thing lags the finger and a light thing doesn't.
 *
 * Classic script. Exposes globalThis.Feel (works in the browser and in Node).
 */
(function (global) {
  "use strict";

  const TAU = Math.PI * 2;
  const H = 1 / 240; // physics step, seconds
  const NEUTRAL = { mass: 1, freq: 2.2, zeta: 0.8 };

  // ───────────────────────────────────────────── parameters
  // Two equivalent ways to name a spring:
  //   physical: mass m, stiffness k, damping c        (m·x″ = −k·(x − target) − c·v + forces)
  //   modal:    mass m, natural frequency f (Hz), damping ratio ζ
  // Designers think in the second, the solver runs on the first.

  function fromModal(o) {
    const mass = o.mass ?? 1;
    const w = TAU * o.freq;
    const stiffness = mass * w * w;
    return { mass, stiffness, damping: 2 * o.zeta * Math.sqrt(stiffness * mass) };
  }

  function modal(p) {
    const w = Math.sqrt(p.stiffness / p.mass);
    return { mass: p.mass, omega: w, freq: w / TAU, zeta: p.damping / (2 * Math.sqrt(p.stiffness * p.mass)) };
  }

  function params(o) {
    if (typeof o === "string") return words(o).params;
    if (o.stiffness != null) return { mass: o.mass ?? 1, stiffness: o.stiffness, damping: o.damping ?? 2 * Math.sqrt(o.stiffness * (o.mass ?? 1)) };
    return fromModal({ ...NEUTRAL, ...o });
  }

  // ───────────────────────────────────────────── the exact solution
  // Displacement u = x − target, starting at u0 with velocity v0.
  // Returns t → [u, v]. Used to draw the ghost curve, to measure overshoot and
  // settle time, to export CSS linear(), and by the audit to check the solver.

  function response(p, u0, v0 = 0) {
    const { omega: w, zeta: z } = modal(p);
    if (Math.abs(z - 1) < 1e-6) {
      const A = u0, B = v0 + w * u0;
      return (t) => { const e = Math.exp(-w * t); return [e * (A + B * t), e * (B - w * (A + B * t))]; };
    }
    if (z < 1) {
      const wd = w * Math.sqrt(1 - z * z), A = u0, B = (v0 + z * w * u0) / wd;
      return (t) => {
        const e = Math.exp(-z * w * t), c = Math.cos(wd * t), s = Math.sin(wd * t);
        return [e * (A * c + B * s), e * ((B * wd - z * w * A) * c - (A * wd + z * w * B) * s)];
      };
    }
    const q = Math.sqrt(z * z - 1), r1 = -w * (z - q), r2 = -w * (z + q);
    const C2 = (v0 - r1 * u0) / (r2 - r1), C1 = u0 - C2;
    return (t) => { const e1 = Math.exp(r1 * t), e2 = Math.exp(r2 * t); return [C1 * e1 + C2 * e2, C1 * r1 * e1 + C2 * r2 * e2]; };
  }

  function decayRate(p) {
    const { omega: w, zeta: z } = modal(p);
    return z < 1 ? z * w : Math.abs(z - 1) < 1e-6 ? w : w * (z - Math.sqrt(z * z - 1));
  }

  // Step from rest to a target one unit away. Settle is the last moment the
  // motion is outside a ±2% band: the time the eye stops seeing it move.
  function metrics(p, band = 0.02) {
    const m = modal(p);
    const f = response(p, -1, 0);
    const tEnd = Math.min(30, 14 / decayRate(p));
    const N = 6000;
    let overshoot = 0, settle = 0, rise0 = null, rise1 = null, peakV = 0;
    for (let i = 0; i <= N; i++) {
      const t = (tEnd * i) / N;
      const [u, v] = f(t);
      if (u > overshoot) overshoot = u;
      if (Math.abs(u) > band) settle = t;
      if (rise0 == null && u >= -0.9) rise0 = t;
      if (rise1 == null && u >= -0.1) rise1 = t;
      if (Math.abs(v) > peakV) peakV = Math.abs(v);
    }
    return { ...m, stiffness: p.stiffness, damping: p.damping, overshoot, settle, rise: rise1 != null && rise0 != null ? rise1 - rise0 : null, peakVelocity: peakV };
  }

  // ───────────────────────────────────────────── words → physics
  // Each word is a point in (frequency, damping ratio, mass). Several words
  // blend: frequency by geometric mean, damping ratio by mean, mass by product.
  // Mass is felt in interaction (drag lag, flick distance, magnets), frequency
  // and damping are felt in the motion itself.

  const WORDS = {
    snappy: { freq: 3.4, zeta: 0.82 }, crisp: { freq: 3.8, zeta: 0.92 }, quick: { freq: 3.6, zeta: 0.95 }, instant: { freq: 6, zeta: 1 },
    precise: { freq: 4.5, zeta: 1 }, stiff: { freq: 4.6, zeta: 0.9 }, firm: { freq: 3.8, zeta: 0.95 }, tight: { freq: 4.2, zeta: 0.85 },
    smooth: { freq: 1.8, zeta: 1 }, soft: { freq: 1.4, zeta: 1 }, gentle: { freq: 1.2, zeta: 1 }, calm: { freq: 1.1, zeta: 1.1 }, lazy: { freq: 0.9, zeta: 1.2 },
    bouncy: { freq: 2.4, zeta: 0.38 }, playful: { freq: 2.6, zeta: 0.45 }, springy: { freq: 2.8, zeta: 0.32 }, wobbly: { freq: 1.8, zeta: 0.22 }, loose: { freq: 1.6, zeta: 0.3 }, elastic: { freq: 2.2, zeta: 0.28 },
    heavy: { mass: 3, freq: 1.35, zeta: 0.74 }, weighty: { mass: 2.6, freq: 1.5, zeta: 0.78 }, solid: { mass: 2, freq: 2.2, zeta: 0.88 }, massive: { mass: 4.5, freq: 1.1, zeta: 0.8 },
    light: { mass: 0.45, freq: 3, zeta: 0.62 }, airy: { mass: 0.35, freq: 2.2, zeta: 0.55 }, feathery: { mass: 0.25, freq: 1.8, zeta: 0.6 },
    magnetic: { magnet: 1 }, sticky: { friction: 1 }, resistant: { friction: 0.7, zeta: 1 }, clicky: { magnet: 0.6, freq: 3.4 }, tactile: { magnet: 0.5 },
  };
  const AMPLIFY = { very: 1.6, really: 1.5, super: 1.8, extra: 1.6, slightly: 0.5, "a bit": 0.5, somewhat: 0.6, little: 0.5 };

  function words(text) {
    const tokens = String(text).toLowerCase().replace(/a bit/g, "a-bit").split(/[^a-z-]+/).filter(Boolean);
    const used = [], unknown = [];
    let logF = 0, nF = 0, zSum = 0, nZ = 0, mass = 1, magnet = 0, friction = 0, gain = 1;
    for (const raw of tokens) {
      const t = raw === "a-bit" ? "a bit" : raw;
      if (AMPLIFY[t]) { gain = AMPLIFY[t]; continue; }
      const w = WORDS[t] || WORDS[t.replace(/ly$/, "")] || WORDS[t.replace(/ness$/, "")];
      if (!w) { if (t.length > 3 && !STOP.has(t)) unknown.push(t); gain = 1; continue; }
      used.push(gain === 1 ? t : `${raw.replace("a-bit", "a bit")}`);
      const pull = (val, neutral, log) => (log ? Math.exp(Math.log(neutral) + (Math.log(val) - Math.log(neutral)) * gain) : neutral + (val - neutral) * gain);
      if (w.freq) { logF += Math.log(pull(w.freq, NEUTRAL.freq, true)); nF++; }
      if (w.zeta) { zSum += pull(w.zeta, NEUTRAL.zeta, false); nZ++; }
      if (w.mass) mass *= pull(w.mass, 1, true);
      if (w.magnet) magnet = Math.max(magnet, w.magnet * gain);
      if (w.friction) friction = Math.max(friction, w.friction * gain);
      gain = 1;
    }
    const modalP = { mass: Math.min(8, Math.max(0.15, mass)), freq: nF ? Math.exp(logF / nF) : NEUTRAL.freq, zeta: nZ ? Math.max(0.1, zSum / nZ) : NEUTRAL.zeta };
    return { words: used, unknown, modal: modalP, params: fromModal(modalP), magnet, friction };
  }
  const STOP = new Set(["that", "feels", "feel", "with", "like", "toggle", "drawer", "button", "sheet", "slider", "switch", "card", "menu", "modal", "should", "when", "into", "snap", "and", "the"]);

  // ───────────────────────────────────────────── force fields
  // A force is f(x, v, body) → force. Fields that have resting points expose
  // rest(x) so the body knows where it will come to rest.

  const smooth = (e) => (e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e));

  // Stops that pull: a weak, long reach toward the nearest stop, plus a strong
  // pull inside a small radius (the click you feel as it lands).
  function magnets(o) {
    const stops = o.stops.slice().sort((a, b) => a - b);
    const cfg = { reachFreq: o.reachFreq ?? 0.9, clickFreq: o.clickFreq ?? 5.5, clickRadius: o.clickRadius ?? 18 };
    const nearest = (x) => stops.reduce((best, s) => (Math.abs(s - x) < Math.abs(best - x) ? s : best), stops[0]);
    const f = (x, v, body) => {
      const d = nearest(x), u = x - d;
      const kFar = body.mass * (TAU * cfg.reachFreq) ** 2, kNear = body.mass * (TAU * cfg.clickFreq) ** 2;
      return -kFar * u - kNear * u * smooth(1 - Math.abs(u) / cfg.clickRadius);
    };
    f.cfg = cfg;
    f.rest = nearest;
    f.stops = stops;
    f.kind = "magnets";
    return f;
  }

  // Sliding friction: a constant drag that opposes motion (smoothed at v ≈ 0).
  function friction(o = {}) {
    const level = o.level ?? 900; // px/s² of deceleration
    const f = (x, v, body) => -level * body.mass * Math.tanh(v / 30);
    f.kind = "friction";
    return f;
  }

  function gravity(g) { const f = (x, v, body) => g * body.mass; f.kind = "gravity"; return f; }

  // ───────────────────────────────────────────── the body

  let reducedMotion = false;
  if (typeof matchMedia === "function") {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = mq.matches;
    mq.addEventListener?.("change", (e) => (reducedMotion = e.matches));
  }

  class Body {
    constructor(o = {}) {
      const p = o.feel ? params(o.feel) : params(o);
      this.mass = p.mass; this.stiffness = p.stiffness; this.damping = p.damping;
      this.x = o.x ?? 0; this.v = o.v ?? 0;
      this.forces = o.forces || [];
      this.target = o.target !== undefined ? o.target : this.forces.some((f) => f.rest) ? null : this.x;
      this.min = o.min ?? -Infinity; this.max = o.max ?? Infinity;
      this.wallFreq = o.wallFreq ?? 8;
      this.handFreq = o.handFreq ?? 6; // how tightly a finger holds a body of mass 1
      this.hand = null;
      this.restV = o.restV ?? 4; // px/s
      this.restX = o.restX ?? 0.25; // px
      this.onFrame = o.onFrame || null; this.onSettle = o.onSettle || null; this.onRelease = o.onRelease || null;
      this.events = [];
      this.trace = []; this.clock = 0; this.eventAt = 0;
      this.name = o.name || "body";
    }

    get params() { return { mass: this.mass, stiffness: this.stiffness, damping: this.damping }; }
    set params(p) { const q = params(p); this.mass = q.mass; this.stiffness = q.stiffness; this.damping = q.damping; this.wake(); }

    // Total force at (x, v), without inertia: what the rig plots and the audit checks.
    force(x = this.x, v = this.v, { hand = true } = {}) {
      let F = -this.damping * v;
      if (this.target != null && !(hand && this.hand)) F += -this.stiffness * (x - this.target);
      for (const f of this.forces) F += f(x, v, this);
      const kw = this.mass * (TAU * this.wallFreq) ** 2, cw = 2 * 0.9 * Math.sqrt(kw * this.mass);
      if (x < this.min) F += -kw * (x - this.min) - (v < 0 ? cw * v : 0);
      if (x > this.max) F += -kw * (x - this.max) - (v > 0 ? cw * v : 0);
      if (hand && this.hand) {
        // The hand is a spring tuned for a unit mass, so a heavier body lags the finger.
        const kh = (TAU * this.handFreq) ** 2 * 1.0, ch = 2 * Math.sqrt(kh * this.mass);
        F += kh * (this.hand.x - x) + ch * (this.hand.v - v);
      }
      return F;
    }

    step(dt) {
      const n = Math.max(1, Math.ceil(dt / H)), h = dt / n;
      for (let i = 0; i < n; i++) {
        // RK4
        const x = this.x, v = this.v, a = (X, V) => this.force(X, V) / this.mass;
        const k1x = v, k1v = a(x, v);
        const k2x = v + (h / 2) * k1v, k2v = a(x + (h / 2) * k1x, v + (h / 2) * k1v);
        const k3x = v + (h / 2) * k2v, k3v = a(x + (h / 2) * k2x, v + (h / 2) * k2v);
        const k4x = v + h * k3v, k4v = a(x + h * k3x, v + h * k3v);
        this.x = x + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
        this.v = v + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
      }
      this.clock += dt;
    }

    // Where the body will come to rest if nobody touches it.
    rest(x = this.x) {
      if (this.target != null) return this.target;
      const field = this.forces.find((f) => f.rest);
      return field ? field.rest(x) : null;
    }

    // How far it would coast on damping alone: x + v·m/c. A flick decides with this.
    projected() { return this.x + (this.v * this.mass) / this.damping; }

    settled() {
      if (this.hand) return false;
      const r = this.rest();
      return Math.abs(this.v) < this.restV && (r == null || Math.abs(this.x - r) < this.restX);
    }

    atRest() {
      if (this.hand) return false;
      const r = this.rest();
      return Math.abs(this.v) < this.restV && (r == null || Math.abs(this.x - r) < this.restX);
    }

    // One gesture is one trace: a grab, or anything that starts from rest,
    // begins a new one; a release or retarget mid-motion only adds a marker.
    mark(kind, extra = {}, fresh = this.atRest()) {
      if (kind === "grab" || kind === "jump" || fresh) { this.eventAt = this.clock; this.trace = []; }
      this.events.push({ kind, t: this.clock, x: this.x, v: this.v, ...extra });
      if (this.events.length > 40) this.events.shift();
    }

    // The path the model predicts from (x, v) with nobody touching it:
    // spring, walls and fields included. The rig draws it as the ghost.
    path(x0 = this.x, v0 = this.v, seconds = 3, fps = 120) {
      const ghost = new Body({ mass: this.mass, stiffness: this.stiffness, damping: this.damping, x: x0, v: v0, target: this.target, forces: this.forces, min: this.min, max: this.max, wallFreq: this.wallFreq, restV: this.restV, restX: this.restX });
      const out = [[0, x0, v0]];
      for (let i = 1; i <= seconds * fps; i++) { ghost.step(1 / fps); out.push([i / fps, ghost.x, ghost.v]); if (ghost.settled()) break; }
      return out;
    }

    record() {
      this.trace.push({ t: this.clock - this.eventAt, x: this.x, v: this.v, target: this.rest(), held: !!this.hand });
      if (this.trace.length > 2400) this.trace.shift();
    }

    // ─── commands (every one is a force or a target, never a duration)
    to(target) { const fresh = this.atRest(); this.target = target; this.mark("to", { target }, fresh); this.wake(); return this; }
    kick(v) { const fresh = this.atRest(); this.v += v; this.mark("kick", { dv: v }, fresh); this.wake(); return this; }
    // Give the push that lands the body at x. With no field that is the coast
    // formula (Δx·c/m). In a field, magnets pull back, so the push is found by
    // simulating forward: the smallest push that comes to rest at x, plus a
    // margin that still rests at x. Still one impulse; never a timed slide.
    kickTo(x) {
      const field = this.forces.find((f) => f.rest);
      const dir = Math.sign(x - this.x) || 1;
      let v = ((x - this.x) * this.damping) / this.mass - this.v;
      if (field) {
        const lands = (v0) => this.predict(this.v + v0) === x;
        let lo = null;
        for (let s = 40; s < 40000; s *= 1.18) if (lands(dir * s)) { lo = s; break; }
        if (lo != null) v = dir * (lands(dir * lo * 1.15) ? lo * 1.15 : lo);
      }
      return this.kick(v);
    }

    // Where the body would come to rest from (x, v) with nobody touching it.
    predict(v0 = this.v, x0 = this.x, horizon = 6) {
      const ghost = new Body({ mass: this.mass, stiffness: this.stiffness, damping: this.damping, x: x0, v: v0, target: this.target, forces: this.forces, min: this.min, max: this.max, wallFreq: this.wallFreq });
      for (let t = 0; t < horizon; t += 1 / 60) { ghost.step(1 / 60); if (ghost.settled()) break; }
      return ghost.rest();
    }
    jump(x) { this.x = x; this.v = 0; if (this.target != null) this.target = x; this.mark("jump"); this.onFrame && this.onFrame(this); return this; }

    grab(px, t = now()) { this.hand = { x: px, v: 0, t }; this.mark("grab", { px }); this.wake(); return this; }
    move(px, t = now()) {
      if (!this.hand) return this;
      const dt = (t - this.hand.t) / 1000;
      if (dt > 0) { const vNew = (px - this.hand.x) / dt; this.hand.v = this.hand.v * 0.35 + vNew * 0.65; }
      this.hand.x = px; this.hand.t = t;
      this.wake();
      return this;
    }
    release() {
      if (!this.hand) return this;
      // A pointer that stopped before letting go has no velocity left.
      if (now() - this.hand.t > 60) this.hand.v = 0;
      this.hand = null;
      const projected = this.projected();
      this.mark("release", { projected });
      this.onRelease && this.onRelease(this, projected);
      this.wake();
      return this;
    }

    wake() { loop.add(this); return this; }

    settleNow() {
      if (this.hand) return;
      const r = this.target != null ? this.target : this.rest(this.projected());
      if (r != null) { this.x = r; if (this.target != null) this.target = r; }
      this.v = 0;
    }

    energy() {
      // Kinetic + spring potential (+ field potential is ignored: used only as a sanity signal).
      const u = this.target != null ? this.x - this.target : 0;
      return 0.5 * this.mass * this.v * this.v + 0.5 * this.stiffness * u * u;
    }
  }

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  // ───────────────────────────────────────────── one loop for every body

  const loop = (() => {
    const bodies = new Set();
    let raf = 0, last = 0;
    const hasRaf = typeof requestAnimationFrame === "function";
    function frame(t) {
      const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
      last = t;
      for (const b of bodies) {
        if (reducedMotion && !b.hand) b.settleNow(); else b.step(dt);
        b.record();
        b.onFrame && b.onFrame(b);
        if (!b.atRest()) b.moved = true;
        if (b.settled()) {
          const r = b.rest();
          if (r != null) b.x = r;
          b.v = 0;
          b.record();
          b.onFrame && b.onFrame(b);
          bodies.delete(b);
          // Only real motion is reported: waking a body that was already at rest is not a settle.
          if (b.moved) { b.events.push({ kind: "settle", t: b.clock, x: b.x, after: b.clock - b.eventAt }); b.onSettle && b.onSettle(b); }
          b.moved = false;
        }
      }
      raf = bodies.size ? requestAnimationFrame(frame) : 0;
      if (!raf) last = 0;
    }
    return {
      add(b) { bodies.add(b); if (hasRaf && !raf) { last = 0; raf = requestAnimationFrame(frame); } },
      size: () => bodies.size,
    };
  })();

  // ───────────────────────────────────────────── pointer → hand

  // Bind a draggable element to a body along one axis. `scale` maps pointer px
  // to body units. Taps (no movement) call onTap. Nothing here sets a position:
  // the pointer only moves the hand.
  function drag(el, body, o = {}) {
    const axis = o.axis || "x", scale = o.scale ?? 1, slop = o.slop ?? 4;
    let start = null;
    el.style.touchAction = axis === "x" ? "pan-y" : "pan-x";
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      start = { p: axis === "x" ? e.clientX : e.clientY, x: body.x, moved: false, id: e.pointerId };
    });
    el.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      const p = axis === "x" ? e.clientX : e.clientY;
      if (!start.moved && Math.abs(p - start.p) < slop) return;
      if (!start.moved) { start.moved = true; body.grab(start.x + (p - start.p) * scale, e.timeStamp); o.onGrab && o.onGrab(); }
      body.move(start.x + (p - start.p) * scale, e.timeStamp);
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const s = start; start = null;
      if (s.moved) body.release(); else o.onTap && o.onTap(e);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // ───────────────────────────────────────────── export to other libraries
  // The same equation runs in Framer Motion, react-spring and SwiftUI, so the
  // numbers carry over exactly. CSS can only replay a step: linear() is sampled
  // from the exact solution and its length is the settle time, not a choice.

  function exportCode(p, kind, body) {
    const r = (n, d = 2) => Number(n.toFixed(d));
    const field = body && body.target == null && body.forces.find((f) => f.kind === "magnets");
    if (field) return exportField(body, field, kind, r);
    const m = metrics(p);
    switch (kind) {
      case "framer":
        return `transition={{ type: "spring", mass: ${r(p.mass)}, stiffness: ${r(p.stiffness, 1)}, damping: ${r(p.damping, 2)} }}`;
      case "react-spring":
        return `config: { mass: ${r(p.mass)}, tension: ${r(p.stiffness, 1)}, friction: ${r(p.damping, 2)} }`;
      case "swiftui":
        return `.animation(.interpolatingSpring(mass: ${r(p.mass)}, stiffness: ${r(p.stiffness, 1)}, damping: ${r(p.damping, 2)}), value: state)`;
      case "compose":
        return `spring(dampingRatio = ${r(m.zeta, 3)}f, stiffness = ${r(p.stiffness / p.mass, 1)}f)`;
      case "css": {
        const f = response(p, -1, 0), T = m.settle * 1.15, n = 48, pts = [];
        for (let i = 0; i <= n; i++) {
          const t = (T * i) / n, y = i === n ? 1 : 1 + f(t)[0];
          pts.push(i === 0 ? "0" : i === n ? "1" : `${r(y, 4)} ${r((100 * i) / n, 1)}%`);
        }
        return `transition: transform ${Math.round(T * 1000)}ms linear(${pts.join(", ")});\n/* ${Math.round(T * 1000)}ms is the settle time of m ${r(p.mass)} · k ${r(p.stiffness, 1)} · c ${r(p.damping)}, not a choice. CSS replays a step from rest; it can't carry a flick's velocity. */`;
      }
      default:
        return JSON.stringify({ mass: r(p.mass), stiffness: r(p.stiffness, 1), damping: r(p.damping, 2) });
    }
  }

  // A body in a field has no single spring to export. Framer Motion's drag
  // inertia is the closest match: coast on damping (timeConstant = m/c), then a
  // spring into the nearest stop (the click). Other targets have no equivalent.
  function exportField(b, f, kind, r) {
    const tc = Math.round((1000 * b.mass) / b.damping);
    const kNear = b.mass * (TAU * f.cfg.clickFreq) ** 2, cNear = 2 * 0.75 * Math.sqrt(kNear * b.mass);
    const stops = JSON.stringify(f.stops);
    if (kind === "framer") {
      return `drag="y"\ndragConstraints={{ top: ${f.stops[0]}, bottom: ${f.stops[f.stops.length - 1]} }}\ndragTransition={{\n  power: 1,\n  timeConstant: ${tc},\n  modifyTarget: (t) => ${stops}.reduce((a, s) => Math.abs(s - t) < Math.abs(a - t) ? s : a),\n  bounceStiffness: ${r(kNear, 0)},\n  bounceDamping: ${r(cNear, 1)},\n}}\n/* Approximates the field: coast with timeConstant = m/c, then a spring into the nearest stop. */`;
    }
    if (kind === "css") return "/* CSS can't do this: a field has no duration to replay. Ship runtime/feel.js (8 kB gzipped) or use the Framer Motion export. */";
    return `/* ${kind} has no force fields. Ship runtime/feel.js and Feel.magneticDrawer, or port the force law:\n   F(x) = −m(2π·${r(f.cfg.reachFreq)})²·u − m(2π·${r(f.cfg.clickFreq)})²·u·smoothstep(1 − |u|/${f.cfg.clickRadius})   (u = x − nearest stop)\n   with damping c = ${r(b.damping)}, mass m = ${r(b.mass)} */`;
  }

  function describe(p) {
    const m = metrics(p);
    const r = (n, d) => Number(n.toFixed(d));
    return { mass: r(p.mass, 2), stiffness: r(p.stiffness, 1), damping: r(p.damping, 2), freq: r(m.freq, 2), zeta: r(m.zeta, 2), overshoot: r(m.overshoot * 100, 1), settle: Math.round(m.settle * 1000) };
  }

  global.Feel = { Body, params, fromModal, modal, response, metrics, words, WORDS, magnets, friction, gravity, drag, exportCode, describe, loop, TAU, get reducedMotion() { return reducedMotion; } };
})(typeof window !== "undefined" ? window : globalThis);
