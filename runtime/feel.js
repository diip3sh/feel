/*! Feel runtime v0.2 · MIT
 *
 * Interactions built on physics. Every motion comes from a physical model:
 * a body with mass, a spring with stiffness, damping, and optional force fields
 * (magnets, friction, walls). There are no durations and no easing curves.
 * A drag is a force too: the pointer pulls the body through a "hand" spring,
 * so a heavy thing lags the finger and a light thing doesn't.
 *
 * Bodies move along one axis (Body: a position, or an angle in degrees) or in
 * a plane (Body2D). Feel.handoff bakes a released body's whole future into
 * keyframes the browser plays, so the motion keeps its velocity, its walls and
 * its magnets without a frame of JavaScript.
 *
 * Classic script. Exposes globalThis.Feel (works in the browser and in Node).
 */
(function (global) {
  "use strict";

  const TAU = Math.PI * 2;
  const H = 1 / 240; // physics step, seconds
  const BAKE_FPS = 240; // samples per second of a baked path
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
  // A 2D spring is isotropic, so each axis follows this on its own.

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
  const STOP = new Set(["that", "feels", "feel", "with", "like", "toggle", "drawer", "button", "sheet", "slider", "switch", "card", "menu", "modal", "should", "when", "into", "snap", "and", "the", "knob", "dial"]);

  // ───────────────────────────────────────────── force fields
  // A force is f(x, v, body) → force for a Body, or f(x, y, vx, vy, body) →
  // [fx, fy] for a Body2D. Fields that have resting points expose rest(…) so
  // the body knows where it will come to rest.

  const smooth = (e) => (e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e));

  // Stops that pull: a weak, long reach toward the nearest stop, plus a strong
  // pull inside a small radius (the click you feel as it lands). With `period`
  // (360 for a wheel) the stops repeat, so 355° is 5° from the stop at 0°;
  // rest() then returns the copy of the stop nearest the body, unwrapped.
  function magnets(o) {
    const stops = o.stops.slice().sort((a, b) => a - b);
    const period = o.period || 0;
    const cfg = { reachFreq: o.reachFreq ?? 0.9, clickFreq: o.clickFreq ?? 5.5, clickRadius: o.clickRadius ?? 18 };
    const nearest = (x) => {
      let best = stops[0], gap = Infinity;
      for (const s of stops) {
        const c = period ? s + period * Math.round((x - s) / period) : s;
        if (Math.abs(c - x) < gap) { gap = Math.abs(c - x); best = c; }
      }
      return best;
    };
    const f = (x, v, body) => {
      const d = nearest(x), u = x - d;
      const kFar = body.mass * (TAU * cfg.reachFreq) ** 2, kNear = body.mass * (TAU * cfg.clickFreq) ** 2;
      return -kFar * u - kNear * u * smooth(1 - Math.abs(u) / cfg.clickRadius);
    };
    f.cfg = cfg;
    f.rest = nearest;
    f.stops = stops;
    f.period = period;
    f.kind = "magnets";
    return f;
  }

  // The same magnets in a plane: each stop is a point, and the nearest one is
  // measured in a straight line. Two 1D bodies can't do this, because which
  // stop is nearest depends on both coordinates at once.
  function points(o) {
    const stops = o.stops.map((s) => ({ x: s.x, y: s.y }));
    const cfg = { reachFreq: o.reachFreq ?? 0.9, clickFreq: o.clickFreq ?? 5.5, clickRadius: o.clickRadius ?? 24 };
    const nearest = (x, y) => {
      let best = stops[0], gap = Infinity;
      for (const s of stops) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < gap) { gap = d; best = s; } }
      return best;
    };
    const f = (x, y, vx, vy, body) => {
      const s = nearest(x, y), ux = x - s.x, uy = y - s.y;
      const kFar = body.mass * (TAU * cfg.reachFreq) ** 2, kNear = body.mass * (TAU * cfg.clickFreq) ** 2;
      const k = kFar + kNear * smooth(1 - Math.hypot(ux, uy) / cfg.clickRadius);
      return [-k * ux, -k * uy];
    };
    f.cfg = cfg;
    f.rest = nearest;
    f.stops = stops;
    f.kind = "points";
    return f;
  }

  // Sliding friction: a constant drag that opposes motion (smoothed at v ≈ 0).
  function friction(o = {}) {
    const level = o.level ?? 900; // px/s² of deceleration
    const f = (x, v, body) => -level * body.mass * Math.tanh(v / 30);
    f.kind = "friction";
    return f;
  }

  function friction2d(o = {}) {
    const level = o.level ?? 900;
    const f = (x, y, vx, vy, body) => {
      const s = Math.hypot(vx, vy);
      if (!s) return [0, 0];
      const a = (-level * body.mass * Math.tanh(s / 30)) / s;
      return [a * vx, a * vy];
    };
    f.kind = "friction";
    return f;
  }

  function gravity(g) { const f = (x, v, body) => g * body.mass; f.kind = "gravity"; return f; }

  // A stiff, well-damped spring past each end of travel. It damps only while
  // the body presses in, so it pushes back without holding on.
  function wall(x, v, min, max, body) {
    const kw = body.mass * (TAU * body.wallFreq) ** 2, cw = 2 * 0.9 * Math.sqrt(kw * body.mass);
    if (x < min) return -kw * (x - min) - (v < 0 ? cw * v : 0);
    if (x > max) return -kw * (x - max) - (v > 0 ? cw * v : 0);
    return 0;
  }

  // ───────────────────────────────────────────── bodies

  let reducedMotion = false;
  if (typeof matchMedia === "function") {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = mq.matches;
    mq.addEventListener?.("change", (e) => (reducedMotion = e.matches));
  }

  const lerp = (a, b, f) => { const o = {}; for (const k in a) o[k] = a[k] + (b[k] - a[k]) * f; return o; };
  const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;

  // Keep the fewest samples whose straight-line interpolation in time stays
  // within `tol` of the full path (Ramer–Douglas–Peucker, measured at equal
  // times, because that is how the browser interpolates keyframes).
  function simplify(dense, tol, gap) {
    const keep = new Uint8Array(dense.length);
    keep[0] = keep[dense.length - 1] = 1;
    const stack = [[0, dense.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop(), a = dense[i], b = dense[j];
      let worst = tol, at = -1;
      for (let k = i + 1; k < j; k++) {
        const e = gap(dense[k], a, b, (dense[k].t - a.t) / (b.t - a.t));
        if (e > worst) { worst = e; at = k; }
      }
      if (at > 0) { keep[at] = 1; stack.push([i, at], [at, j]); }
    }
    return dense.filter((_, k) => keep[k]);
  }

  // What every body shares: the trace the rig plots, event markers, waking the
  // loop, and handing a free motion to the browser. A subclass supplies the
  // state (state, setState, view, gap, ghost) and the physics.
  class Mover {
    init(o) {
      this.wallFreq = o.wallFreq ?? 8;
      this.handFreq = o.handFreq ?? 6; // how tightly a finger holds a body of mass 1
      this.hand = null;
      this.restV = o.restV ?? 4; // units/s
      this.restX = o.restX ?? 0.25; // units
      this.unit = o.unit || "px";
      this.onFrame = o.onFrame || null; this.onSettle = o.onSettle || null; this.onRelease = o.onRelease || null; this.onBake = o.onBake || null;
      this.events = [];
      this.trace = []; this.clock = 0; this.eventAt = 0;
      this.name = o.name || "body";
      this.handoff = null; this.baked = null; this.bakeQueued = false;
    }

    get params() { return { mass: this.mass, stiffness: this.stiffness, damping: this.damping }; }
    set params(p) { this.interrupt(); const q = params(p); this.mass = q.mass; this.stiffness = q.stiffness; this.damping = q.damping; this.wake(); }

    // One gesture is one trace: a grab, or anything that starts from rest,
    // begins a new one; a release or retarget mid-motion only adds a marker.
    mark(kind, extra = {}, fresh = this.atRest()) {
      if (kind === "grab" || kind === "jump" || fresh) { this.eventAt = this.clock; this.trace = []; }
      this.events.push({ kind, t: this.clock, ...this.state(), ...extra });
      if (this.events.length > 40) this.events.shift();
    }

    record(over = {}) {
      this.trace.push({ t: this.clock - this.eventAt, ...this.state(), target: this.rest(), held: !!this.hand, ...over });
      if (this.trace.length > 2400) this.trace.shift();
    }

    wake() {
      if (this.handoff && !this.hand && !reducedMotion) {
        // Several commands in one event (release, then a new target) make one bake.
        if (!this.bakeQueued) { this.bakeQueued = true; queueMicrotask(() => { this.bakeQueued = false; this.startBake(); }); }
        return this;
      }
      loop.add(this);
      return this;
    }

    // The whole future from the current state with nobody touching it,
    // sampled at 240 Hz and simplified to keyframes. Pure: runs in Node.
    bake(tolerance = 0.2, horizon = 8) {
      const g = this.ghost(), dense = [{ t: 0, ...g.state() }];
      for (let i = 1; i <= horizon * BAKE_FPS; i++) {
        g.step(1 / BAKE_FPS);
        const done = g.settled();
        if (done) g.snap();
        dense.push({ t: i / BAKE_FPS, ...g.state() });
        if (done) break;
      }
      const keys = simplify(dense, tolerance, (s, a, b, f) => this.gap(s, a, b, f));
      return { duration: dense[dense.length - 1].t, keys, dense };
    }

    startBake() {
      if (!this.handoff || this.hand) return;
      const paint = this.handoff.styles;
      const first = paint(this);
      if (!first.every(([el]) => typeof el.animate === "function")) { loop.add(this); return; }
      loop.remove(this);
      this.interrupt();
      if (this.settled()) { this.snap(); this.onFrame && this.onFrame(this); return; }
      const b = this.bake(this.handoff.tolerance);
      const frames = b.keys.map((s) => paint(this.view(s)));
      const ms = b.duration * 1000;
      const anims = first.map(([el], j) => el.animate(
        frames.map((f, i) => ({ offset: b.keys[i].t / b.duration, ...f[j][1] })),
        { duration: ms, fill: "forwards" }, // ms is the settle time of the simulated path, not a choice
      ));
      this.baked = { anims, dense: b.dense, duration: b.duration, clock0: this.clock, t0: now() };
      this.moved = true;
      anims[0].finished.then(() => { if (this.baked && this.baked.anims === anims) this.landed(); }, () => {});
      this.onBake && this.onBake(this, b);
    }

    // Read the state at this instant from the baked path, by the animation's
    // own clock. Commands call it first, so they act on where the body is.
    sample() {
      const b = this.baked;
      if (!b) return this;
      const ct = b.anims[0].currentTime;
      const T = Math.min(b.duration, Math.max(0, ct == null ? (now() - b.t0) / 1000 : ct / 1000));
      const d = b.dense, i = Math.min(d.length - 2, Math.floor(T * BAKE_FPS));
      const f = Math.min(1, Math.max(0, (T - d[i].t) / (d[i + 1].t - d[i].t)));
      this.setState(lerp(d[i], d[i + 1], f));
      this.clock = b.clock0 + T;
      return this;
    }

    // Take the motion back from the browser without a jump: paint the current
    // state inline, then drop the keyframes.
    interrupt() {
      const b = this.baked;
      if (!b) return this;
      this.sample();
      this.baked = null;
      this.onFrame && this.onFrame(this);
      for (const a of b.anims) a.cancel();
      return this;
    }

    landed() {
      const b = this.baked;
      this.baked = null;
      this.setState(b.dense[b.dense.length - 1]);
      this.clock = b.clock0 + b.duration;
      this.snap();
      this.record();
      this.onFrame && this.onFrame(this);
      for (const a of b.anims) a.cancel();
      this.moved = false;
      this.events.push({ kind: "settle", t: this.clock, ...this.state(), after: this.clock - this.eventAt });
      this.onSettle && this.onSettle(this);
    }
  }

  // ─── one axis: a position in px, or an angle in degrees (unit: "°")
  class Body extends Mover {
    constructor(o = {}) {
      super();
      const p = o.feel ? params(o.feel) : params(o);
      this.dims = 1;
      this.mass = p.mass; this.stiffness = p.stiffness; this.damping = p.damping;
      this.x = o.x ?? 0; this.v = o.v ?? 0;
      this.forces = o.forces || [];
      this.target = o.target !== undefined ? o.target : this.forces.some((f) => f.rest) ? null : this.x;
      this.min = o.min ?? -Infinity; this.max = o.max ?? Infinity;
      this.init(o);
    }

    state() { return { x: this.x, v: this.v }; }
    setState(s) { this.x = s.x; this.v = s.v; }
    view(s) { return { ...s, mass: this.mass, body: this }; }
    gap(s, a, b, f) { return Math.abs(s.x - (a.x + (b.x - a.x) * f)); }
    ghost(s = this.state()) {
      return new Body({ mass: this.mass, stiffness: this.stiffness, damping: this.damping, x: s.x, v: s.v, target: this.target, forces: this.forces, min: this.min, max: this.max, wallFreq: this.wallFreq, restV: this.restV, restX: this.restX, unit: this.unit });
    }

    // Total force at (x, v), without inertia: what the rig plots and the audit checks.
    force(x = this.x, v = this.v, { hand = true } = {}) {
      let F = -this.damping * v;
      if (this.target != null && !(hand && this.hand)) F += -this.stiffness * (x - this.target);
      for (const f of this.forces) F += f(x, v, this);
      F += wall(x, v, this.min, this.max, this);
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

    snap() { const r = this.rest(); if (r != null) this.x = r; this.v = 0; }

    // The path the model predicts from (x, v) with nobody touching it:
    // spring, walls and fields included. The rig draws it as the ghost.
    path(x0 = this.x, v0 = this.v, seconds = 3, fps = 120) {
      const ghost = this.ghost({ x: x0, v: v0 });
      const out = [[0, x0, v0]];
      for (let i = 1; i <= seconds * fps; i++) { ghost.step(1 / fps); out.push([i / fps, ghost.x, ghost.v]); if (ghost.settled()) break; }
      return out;
    }

    // ─── commands (every one is a force or a target, never a duration)
    to(target) { this.interrupt(); const fresh = this.atRest(); this.target = target; this.mark("to", { target }, fresh); return this.wake(); }
    kick(v) { this.interrupt(); const fresh = this.atRest(); this.v += v; this.mark("kick", { dv: v }, fresh); return this.wake(); }
    // Give the push that lands the body at x. With no field that is the coast
    // formula (Δx·c/m). In a field, magnets pull back, so the push is found by
    // simulating forward: the smallest push that comes to rest at x, plus a
    // margin that still rests at x. Still one impulse; never a timed slide.
    kickTo(x) {
      this.interrupt();
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
      const ghost = this.ghost({ x: x0, v: v0 });
      for (let t = 0; t < horizon; t += 1 / 60) { ghost.step(1 / 60); if (ghost.settled()) break; }
      return ghost.rest();
    }
    jump(x) { this.interrupt(); this.x = x; this.v = 0; if (this.target != null) this.target = x; this.mark("jump"); this.onFrame && this.onFrame(this); return this; }

    grab(px, t = now()) { this.interrupt(); this.hand = { x: px, v: 0, t }; this.mark("grab", { px }); return this.wake(); }
    move(px, t = now()) {
      if (!this.hand) return this;
      const dt = (t - this.hand.t) / 1000;
      if (dt > 0) { const vNew = (px - this.hand.x) / dt; this.hand.v = this.hand.v * 0.35 + vNew * 0.65; }
      this.hand.x = px; this.hand.t = t;
      return this.wake();
    }
    release() {
      if (!this.hand) return this;
      // A pointer that stopped before letting go has no velocity left.
      if (now() - this.hand.t > 60) this.hand.v = 0;
      this.hand = null;
      const projected = this.projected();
      this.mark("release", { projected });
      this.onRelease && this.onRelease(this, projected);
      return this.wake();
    }

    settleNow() {
      this.interrupt();
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

  // ─── a plane: x, y in px, one isotropic spring, walls per axis
  class Body2D extends Mover {
    constructor(o = {}) {
      super();
      const p = o.feel ? params(o.feel) : params(o);
      this.dims = 2;
      this.mass = p.mass; this.stiffness = p.stiffness; this.damping = p.damping;
      this.x = o.x ?? 0; this.y = o.y ?? 0; this.vx = o.vx ?? 0; this.vy = o.vy ?? 0;
      this.forces = o.forces || [];
      this.target = o.target !== undefined ? (o.target && { x: o.target.x, y: o.target.y }) : this.forces.some((f) => f.rest) ? null : { x: this.x, y: this.y };
      this.min = { x: -Infinity, y: -Infinity, ...o.min }; this.max = { x: Infinity, y: Infinity, ...o.max };
      this.init(o);
    }

    get speed() { return Math.hypot(this.vx, this.vy); }
    state() { return { x: this.x, y: this.y, vx: this.vx, vy: this.vy }; }
    setState(s) { this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy; }
    view(s) { return { ...s, speed: Math.hypot(s.vx, s.vy), mass: this.mass, body: this }; }
    gap(s, a, b, f) { return Math.hypot(s.x - (a.x + (b.x - a.x) * f), s.y - (a.y + (b.y - a.y) * f)); }
    ghost(s = this.state()) {
      return new Body2D({ mass: this.mass, stiffness: this.stiffness, damping: this.damping, ...s, target: this.target, forces: this.forces, min: this.min, max: this.max, wallFreq: this.wallFreq, restV: this.restV, restX: this.restX, unit: this.unit });
    }

    force(x = this.x, y = this.y, vx = this.vx, vy = this.vy, { hand = true } = {}) {
      let fx = -this.damping * vx, fy = -this.damping * vy;
      if (this.target && !(hand && this.hand)) { fx -= this.stiffness * (x - this.target.x); fy -= this.stiffness * (y - this.target.y); }
      for (const f of this.forces) { const [a, b] = f(x, y, vx, vy, this); fx += a; fy += b; }
      fx += wall(x, vx, this.min.x, this.max.x, this);
      fy += wall(y, vy, this.min.y, this.max.y, this);
      if (hand && this.hand) {
        const kh = (TAU * this.handFreq) ** 2, ch = 2 * Math.sqrt(kh * this.mass);
        fx += kh * (this.hand.x - x) + ch * (this.hand.vx - vx);
        fy += kh * (this.hand.y - y) + ch * (this.hand.vy - vy);
      }
      return [fx, fy];
    }

    step(dt) {
      const n = Math.max(1, Math.ceil(dt / H)), h = dt / n, m = this.mass;
      const acc = (x, y, vx, vy) => { const [fx, fy] = this.force(x, y, vx, vy); return [fx / m, fy / m]; };
      for (let i = 0; i < n; i++) {
        // RK4, the same scheme as Body on a four-number state
        const x = this.x, y = this.y, vx = this.vx, vy = this.vy;
        const [a1x, a1y] = acc(x, y, vx, vy);
        const v2x = vx + (h / 2) * a1x, v2y = vy + (h / 2) * a1y;
        const [a2x, a2y] = acc(x + (h / 2) * vx, y + (h / 2) * vy, v2x, v2y);
        const v3x = vx + (h / 2) * a2x, v3y = vy + (h / 2) * a2y;
        const [a3x, a3y] = acc(x + (h / 2) * v2x, y + (h / 2) * v2y, v3x, v3y);
        const v4x = vx + h * a3x, v4y = vy + h * a3y;
        const [a4x, a4y] = acc(x + h * v3x, y + h * v3y, v4x, v4y);
        this.x = x + (h / 6) * (vx + 2 * v2x + 2 * v3x + v4x);
        this.y = y + (h / 6) * (vy + 2 * v2y + 2 * v3y + v4y);
        this.vx = vx + (h / 6) * (a1x + 2 * a2x + 2 * a3x + a4x);
        this.vy = vy + (h / 6) * (a1y + 2 * a2y + 2 * a3y + a4y);
      }
      this.clock += dt;
    }

    rest(x = this.x, y = this.y) {
      if (this.target) return this.target;
      const field = this.forces.find((f) => f.rest);
      return field ? field.rest(x, y) : null;
    }

    projected() { const s = this.mass / this.damping; return { x: this.x + this.vx * s, y: this.y + this.vy * s }; }

    settled() {
      if (this.hand) return false;
      const r = this.rest();
      return this.speed < this.restV && (!r || Math.hypot(this.x - r.x, this.y - r.y) < this.restX);
    }

    atRest() { return this.settled(); }

    snap() { const r = this.rest(); if (r) { this.x = r.x; this.y = r.y; } this.vx = 0; this.vy = 0; }

    path(s0 = this.state(), seconds = 3, fps = 120) {
      const ghost = this.ghost(s0);
      const out = [[0, s0.x, s0.y, s0.vx, s0.vy]];
      for (let i = 1; i <= seconds * fps; i++) { ghost.step(1 / fps); out.push([i / fps, ghost.x, ghost.y, ghost.vx, ghost.vy]); if (ghost.settled()) break; }
      return out;
    }

    to(p) { this.interrupt(); const fresh = this.atRest(); this.target = { x: p.x, y: p.y }; this.mark("to", { target: this.target }, fresh); return this.wake(); }
    kick(vx, vy) { this.interrupt(); const fresh = this.atRest(); this.vx += vx; this.vy += vy; this.mark("kick", { dvx: vx, dvy: vy }, fresh); return this.wake(); }
    // The push that lands the body at p. Whatever velocity it had, it leaves
    // along the straight line to p; in a field the speed is found by
    // simulating forward, as in 1D. Still one impulse.
    kickTo(p) {
      this.interrupt();
      const field = this.forces.find((f) => f.rest);
      const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      let s = (d * this.damping) / this.mass;
      if (field) {
        const lands = (q) => same(this.predict(ux * q, uy * q), p);
        let lo = null;
        for (let q = 40; q < 40000; q *= 1.18) if (lands(q)) { lo = q; break; }
        if (lo != null) s = lands(lo * 1.15) ? lo * 1.15 : lo;
      }
      return this.kick(ux * s - this.vx, uy * s - this.vy);
    }

    predict(vx = this.vx, vy = this.vy, x0 = this.x, y0 = this.y, horizon = 6) {
      const ghost = this.ghost({ x: x0, y: y0, vx, vy });
      for (let t = 0; t < horizon; t += 1 / 60) { ghost.step(1 / 60); if (ghost.settled()) break; }
      return ghost.rest();
    }
    jump(p) { this.interrupt(); this.x = p.x; this.y = p.y; this.vx = 0; this.vy = 0; if (this.target) this.target = { x: p.x, y: p.y }; this.mark("jump"); this.onFrame && this.onFrame(this); return this; }

    grab(px, py, t = now()) { this.interrupt(); this.hand = { x: px, y: py, vx: 0, vy: 0, t }; this.mark("grab", { px, py }); return this.wake(); }
    move(px, py, t = now()) {
      if (!this.hand) return this;
      const h = this.hand, dt = (t - h.t) / 1000;
      if (dt > 0) { h.vx = h.vx * 0.35 + ((px - h.x) / dt) * 0.65; h.vy = h.vy * 0.35 + ((py - h.y) / dt) * 0.65; }
      h.x = px; h.y = py; h.t = t;
      return this.wake();
    }
    release() {
      if (!this.hand) return this;
      if (now() - this.hand.t > 60) { this.hand.vx = 0; this.hand.vy = 0; }
      this.hand = null;
      const projected = this.projected();
      this.mark("release", { projected });
      this.onRelease && this.onRelease(this, projected);
      return this.wake();
    }

    settleNow() {
      this.interrupt();
      if (this.hand) return;
      const p = this.projected(), r = this.target || this.rest(p.x, p.y);
      if (r) { this.x = r.x; this.y = r.y; if (this.target) this.target = { x: r.x, y: r.y }; }
      this.vx = 0; this.vy = 0;
    }

    energy() {
      const ux = this.target ? this.x - this.target.x : 0, uy = this.target ? this.y - this.target.y : 0;
      return 0.5 * this.mass * (this.vx * this.vx + this.vy * this.vy) + 0.5 * this.stiffness * (ux * ux + uy * uy);
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
          b.snap();
          b.record();
          b.onFrame && b.onFrame(b);
          bodies.delete(b);
          // Only real motion is reported: waking a body that was already at rest is not a settle.
          if (b.moved) { b.events.push({ kind: "settle", t: b.clock, ...b.state(), after: b.clock - b.eventAt }); b.onSettle && b.onSettle(b); }
          b.moved = false;
        }
      }
      raf = bodies.size ? requestAnimationFrame(frame) : 0;
      if (!raf) last = 0;
    }
    return {
      add(b) { bodies.add(b); if (hasRaf && !raf) { last = 0; raf = requestAnimationFrame(frame); } },
      remove(b) { bodies.delete(b); },
      size: () => bodies.size,
    };
  })();

  // ───────────────────────────────────────────── pointer → hand

  // Bind a draggable element to a body. `axis` is "x" or "y" for a Body
  // along that screen axis, "xy" for a Body2D, or "angle" for a Body in
  // degrees turned around the element's centre (or `pivot`'s). `scale` maps
  // pointer units to body units. Taps (no movement) call onTap. Nothing here
  // sets a position: the pointer only moves the hand.
  function drag(el, body, o = {}) {
    const axis = o.axis || "x", scale = o.scale ?? 1, slop = o.slop ?? 4;
    let start = null;
    el.style.touchAction = axis === "x" ? "pan-y" : axis === "y" ? "pan-x" : "none";
    const angle = (e) => (Math.atan2(e.clientY - start.py, e.clientX - start.px) * 180) / Math.PI;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      body.sample();
      start = { cx: e.clientX, cy: e.clientY, x: body.x, y: body.y, moved: false, id: e.pointerId, turn: 0 };
      if (axis === "angle") {
        const r = (o.pivot || el).getBoundingClientRect();
        start.px = r.left + r.width / 2; start.py = r.top + r.height / 2; start.last = angle(e);
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.cx, dy = e.clientY - start.cy;
      if (axis === "angle") {
        // Unwrap: crossing ±180° is a small turn, not a full one.
        const a = angle(e);
        let d = a - start.last;
        d -= 360 * Math.round(d / 360);
        start.turn += d; start.last = a;
      }
      const dist = axis === "x" ? Math.abs(dx) : axis === "y" ? Math.abs(dy) : Math.hypot(dx, dy);
      if (!start.moved && dist < slop) return;
      const hand = axis === "xy" ? [start.x + dx * scale, start.y + dy * scale] : [start.x + (axis === "x" ? dx : axis === "y" ? dy : start.turn) * scale];
      if (!start.moved) { start.moved = true; body.grab(...hand, e.timeStamp); o.onGrab && o.onGrab(); }
      body.move(...hand, e.timeStamp);
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const s = start; start = null;
      if (s.moved) body.release(); else o.onTap && o.onTap(e);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // ───────────────────────────────────────────── handing off to the browser

  // Write [[el, { transform, boxShadow, "--custom": … }], …] onto the elements.
  function paint(list) {
    for (const [el, props] of list) for (const k in props) el.style.setProperty(k.startsWith("--") ? k : k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()), props[k]);
  }

  // Let the browser play a body's free motion. Whenever nobody holds it, the
  // body simulates its whole future once (spring, walls, fields and the
  // velocity it has) and the browser plays that path as keyframes: no
  // JavaScript per frame, and transforms run off the main thread. A grab or a
  // command mid-flight reads the state at that instant from the same path, so
  // nothing jumps. A drag still runs in JavaScript, because the hand needs it.
  //   styles(b) → [[el, props], …]: the same list onFrame paints.
  //   read()    → where the element really is, for the rig (optional).
  function handoff(body, styles, o = {}) {
    body.handoff = { styles, tolerance: o.tolerance ?? 0.2, read: o.read || null };
    if (!body.atRest()) body.wake();
    return {
      off() {
        if (!body.handoff) return;
        body.interrupt();
        body.handoff = null;
        if (!body.atRest()) body.wake();
      },
    };
  }

  // ───────────────────────────────────────────── export to other libraries
  // The same equation runs in Framer Motion, react-spring and SwiftUI, so the
  // numbers carry over exactly. CSS on its own can only replay a step: linear()
  // is sampled from the exact solution and its length is the settle time, not
  // a choice. Releases and fields go through Feel.handoff instead.

  const HANDOFF = "Feel.handoff(body, styles);  // styles(b) → [[el, { transform: … }]], the same list onFrame paints";

  function exportCode(p, kind, body) {
    const r = (n, d = 2) => Number(n.toFixed(d));
    const field = body && body.target == null && body.forces.find((f) => f.kind === "magnets" || f.kind === "points");
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
        const ms = Math.round(T * 1000);
        return `/* A state change from rest: */\ntransition: transform ${ms}ms linear(${pts.join(", ")});\n/* ${ms}ms is the settle time of m ${r(p.mass)} · k ${r(p.stiffness, 1)} · c ${r(p.damping)}, not a choice. */\n\n/* A release or a flick: the runtime bakes the real path (its velocity, the walls) into keyframes the browser plays. */\n${HANDOFF}`;
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
    if (kind === "css") return `/* CSS can't run a field by itself, but the runtime can bake each release for it: the flick's velocity, the magnets and the walls are all in the baked path. */\n${HANDOFF}\n/* Each animation lasts the settle time of its own path, not a choice. */`;
    if (b.dims === 2) return exportPlane(b, f, kind, r, kNear, cNear);
    const stops = JSON.stringify(f.stops);
    if (kind === "framer" && b.unit === "°") return `/* Framer Motion has no rotational drag inertia, so a detented knob has no equivalent. Ship runtime/feel.js: Feel.drag(el, body, { axis: "angle" }), and Feel.handoff to let the browser play each release. */`;
    if (kind === "framer") {
      return `drag="y"\ndragConstraints={{ top: ${f.stops[0]}, bottom: ${f.stops[f.stops.length - 1]} }}\ndragTransition={{\n  power: 1,\n  timeConstant: ${tc},\n  modifyTarget: (t) => ${stops}.reduce((a, s) => Math.abs(s - t) < Math.abs(a - t) ? s : a),\n  bounceStiffness: ${r(kNear, 0)},\n  bounceDamping: ${r(cNear, 1)},\n}}\n/* Approximates the field: coast with timeConstant = m/c, then a spring into the nearest stop. */`;
    }
    return `/* ${kind} has no force fields. Ship runtime/feel.js (Feel.Body + Feel.magnets), or port the force law:\n   F(x) = −m(2π·${r(f.cfg.reachFreq)})²·u − m(2π·${r(f.cfg.clickFreq)})²·u·smoothstep(1 − |u|/${r(f.cfg.clickRadius, 1)})   (u = x − nearest stop${f.period ? `, stops repeat every ${f.period}` : ""})\n   with damping c = ${r(b.damping)}, mass m = ${r(b.mass)} */`;
  }

  // Framer Motion's drag inertia picks a target per axis, so it can't choose a
  // 2D stop. The nearest equivalent decides on drag end from the projection,
  // then springs each axis into that stop with the release velocity.
  function exportPlane(b, f, kind, r, kNear, cNear) {
    const stops = `[${f.stops.map((s) => `{ x: ${r(s.x, 1)}, y: ${r(s.y, 1)} }`).join(", ")}]`;
    const coast = r(b.mass / b.damping, 4);
    if (kind === "framer") {
      return `drag\ndragMomentum={false}\nonDragEnd={(e, { velocity }) => {\n  // where it would coast: p + v·m/c\n  const at = { x: x.get() + velocity.x * ${coast}, y: y.get() + velocity.y * ${coast} };\n  const stop = ${stops}.reduce((a, s) => Math.hypot(s.x - at.x, s.y - at.y) < Math.hypot(a.x - at.x, a.y - at.y) ? s : a);\n  const spring = { type: "spring", mass: ${r(b.mass)}, stiffness: ${r(kNear, 0)}, damping: ${r(cNear, 1)} };\n  animate(x, stop.x, { ...spring, velocity: velocity.x });\n  animate(y, stop.y, { ...spring, velocity: velocity.y });\n}}\n/* Approximates the field: project the coast, then one spring into the nearest stop. Not the same force law. */`;
    }
    return `/* ${kind} has no 2D force fields. Ship runtime/feel.js (Feel.Body2D + Feel.points), or port the force law:\n   F = −m(2π·${r(f.cfg.reachFreq)})²·u − m(2π·${r(f.cfg.clickFreq)})²·u·smoothstep(1 − |u|/${r(f.cfg.clickRadius, 1)})   (u = p − nearest stop, a vector)\n   with damping c = ${r(b.damping)}, mass m = ${r(b.mass)} */`;
  }

  function describe(p) {
    const m = metrics(p);
    const r = (n, d) => Number(n.toFixed(d));
    return { mass: r(p.mass, 2), stiffness: r(p.stiffness, 1), damping: r(p.damping, 2), freq: r(m.freq, 2), zeta: r(m.zeta, 2), overshoot: r(m.overshoot * 100, 1), settle: Math.round(m.settle * 1000) };
  }

  global.Feel = { Body, Body2D, params, fromModal, modal, response, metrics, words, WORDS, magnets, points, friction, friction2d, gravity, drag, handoff, paint, exportCode, describe, loop, TAU, get reducedMotion() { return reducedMotion; } };
})(typeof window !== "undefined" ? window : globalThis);
