/*! Feel rig v0.1 · MIT
 *
 * A test bench for one body: the live component on the left, and on the right
 * the motion it just made (position and velocity over time, with the exact
 * solution as a dashed ghost), the force field it lives in, and a readout.
 * The margin holds the feel words, the three dials (mass, frequency, damping
 * ratio) and the same spring exported to other libraries.
 *
 * Requires feel.js. Exposes Feel.rig(host, options).
 */
(function (global) {
  "use strict";
  const Feel = global.Feel;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const r = (n, d = 1) => (Number.isFinite(n) ? Number(n.toFixed(d)) : "–");
  const CHIPS = ["heavy", "snappy", "bouncy", "soft", "light", "stiff", "wobbly", "precise"];
  const EXPORTS = [["framer", "Framer Motion"], ["react-spring", "react-spring"], ["swiftui", "SwiftUI"], ["compose", "Compose"], ["css", "CSS"]];

  function rig(host, o) {
    const body = o.body;
    const theme = o.theme || "dark";
    const [lo, hi] = o.travel;
    // A body with a target is a spring; a body with no target lives in a field.
    const field = body.target == null ? body.forces.find((f) => f.kind === "magnets") : null;
    const mode = field ? "field" : "spring";
    host.classList.add("fl");
    host.setAttribute("data-theme", theme);
    host.innerHTML = `
      <div class="fl-card" tabindex="0" role="group">
        <div class="fl-corner fl-tl">Fig. ${esc(o.fig || 1)}</div>
        <div class="fl-corner fl-tr">${esc(o.title || "Rig")}</div>
        <div class="fl-grid">
          <div class="fl-bench"><div class="fl-stage"></div><div class="fl-live"></div></div>
          <div class="fl-plots">
            <div class="fl-plot"><span class="fl-plot-label">position · ${esc(o.unit || "px")} · <i>— measured</i> <i class="fl-dash">┄ predicted</i></span><canvas data-plot="x"></canvas></div>
            <div class="fl-plot"><span class="fl-plot-label">velocity · px/s</span><canvas data-plot="v"></canvas></div>
            <div class="fl-plot"><span class="fl-plot-label">force field · F(x) at rest</span><canvas data-plot="f"></canvas></div>
          </div>
        </div>
        <div class="fl-corner fl-bl fl-hint">${esc(o.hint || "Drag it · flick it")}</div>
        <div class="fl-corner fl-br fl-readout" aria-live="polite"></div>
      </div>
      <div class="fl-margin">
        <label class="fl-ask"><span>Feel</span><input type="text" spellcheck="false" value="${esc(o.feel || "")}" placeholder="heavy, snappy, bouncy…"></label>
        <div class="fl-chips">${CHIPS.map((c) => `<button type="button" data-chip="${c}">${c}</button>`).join("")}</div>
        <div class="fl-unknown"></div>
        <div class="fl-dials">
          ${mode === "spring"
            ? dial("mass", "mass", 0.15, 8, true) + dial("freq", "frequency", 0.4, 7, true, "Hz") + dial("zeta", "damping ratio", 0.1, 1.6, false)
            : dial("mass", "mass", 0.15, 8, true) + dial("damping", "damping c", 2, 160, true) + dial("click", "magnet click", 1, 14, true, "Hz") + dial("reach", "magnet reach", 0.2, 3, true, "Hz")}
        </div>
        <dl class="fl-metrics"></dl>
        <div class="fl-keys">${(o.actions || []).map((a, i) => `<button type="button" data-act="${i}"><kbd>${esc(a.key)}</kbd>${esc(a.label)}</button>`).join("")}</div>
        <div class="fl-export">
          <div class="fl-tabs">${EXPORTS.map(([k, l], i) => `<button type="button" data-ex="${k}" class="${i === 0 ? "is-on" : ""}">${l}</button>`).join("")}</div>
          <pre class="fl-code"></pre>
          <button type="button" class="fl-copy">Copy</button>
        </div>
      </div>`;

    function dial(key, label, min, max, log, unit = "") {
      return `<label class="fl-dial" data-dial="${key}"><span>${label}</span><input type="range" min="0" max="1000" data-min="${min}" data-max="${max}" data-log="${log ? 1 : 0}"><output></output>${unit ? `<em>${unit}</em>` : ""}</label>`;
    }

    host.querySelector(".fl-stage").appendChild(o.stage);
    const card = host.querySelector(".fl-card");
    const readout = host.querySelector(".fl-readout");
    const live = host.querySelector(".fl-live");
    const ask = host.querySelector(".fl-ask input");
    const unknown = host.querySelector(".fl-unknown");
    const metricsEl = host.querySelector(".fl-metrics");
    const code = host.querySelector(".fl-code");
    const canv = Object.fromEntries([...host.querySelectorAll("canvas")].map((c) => [c.dataset.plot, c]));
    let exportKind = "framer";
    const paramsKey = () => `${body.mass}|${body.stiffness}|${body.damping}|${body.target}`;
    const palette = () => {
      const cs = getComputedStyle(host);
      return { lit: cs.getPropertyValue("--fl-lit").trim(), text: cs.getPropertyValue("--fl-text").trim(), muted: cs.getPropertyValue("--fl-muted").trim(), line: cs.getPropertyValue("--fl-line").trim(), faint: cs.getPropertyValue("--fl-faint").trim(), band: cs.getPropertyValue("--fl-band").trim(), ghost: cs.getPropertyValue("--fl-ghost").trim() };
    };
    let P = palette();

    // ─── dials
    const toSlider = (el, val) => {
      const min = +el.dataset.min, max = +el.dataset.max, log = el.dataset.log === "1";
      const f = log ? (Math.log(val) - Math.log(min)) / (Math.log(max) - Math.log(min)) : (val - min) / (max - min);
      el.value = Math.round(Math.max(0, Math.min(1, f)) * 1000);
    };
    const fromSlider = (el) => {
      const min = +el.dataset.min, max = +el.dataset.max, log = el.dataset.log === "1", f = el.value / 1000;
      return log ? Math.exp(Math.log(min) + f * (Math.log(max) - Math.log(min))) : min + f * (max - min);
    };
    const dials = Object.fromEntries([...host.querySelectorAll(".fl-dial")].map((d) => [d.dataset.dial, d.querySelector("input")]));

    function syncDials() {
      const vals = mode === "spring"
        ? (() => { const m = Feel.modal(body.params); return { mass: m.mass, freq: m.freq, zeta: m.zeta }; })()
        : { mass: body.mass, damping: body.damping, click: field.cfg.clickFreq, reach: field.cfg.reachFreq };
      for (const [k, v] of Object.entries(vals)) { toSlider(dials[k], v); dials[k].nextElementSibling.textContent = r(v, 2); }
    }

    function apply(p, from) {
      body.params = p;
      o.onParams && o.onParams(body.params, from);
      syncDials(); describe(); drawAll();
    }

    for (const el of Object.values(dials)) {
      el.addEventListener("input", () => {
        ask.value = "";
        if (mode === "spring") return apply(Feel.fromModal({ mass: fromSlider(dials.mass), freq: fromSlider(dials.freq), zeta: fromSlider(dials.zeta) }), "dial");
        field.cfg.clickFreq = fromSlider(dials.click); field.cfg.reachFreq = fromSlider(dials.reach);
        apply({ mass: fromSlider(dials.mass), stiffness: body.stiffness, damping: fromSlider(dials.damping) }, "dial");
      });
    }

    function applyWords(text) {
      const w = Feel.words(text);
      unknown.textContent = w.unknown.length ? `not in the vocabulary: ${w.unknown.join(", ")}` : w.words.length ? `${w.words.join(" + ")}` : "";
      if (!w.words.length) return;
      if (mode === "field" && w.magnet) { field.cfg.clickFreq = 3 + 4 * w.magnet; field.cfg.reachFreq = 0.6 + 0.5 * w.magnet; }
      apply(w.params, "words");
      o.onWords && o.onWords(w);
    }
    ask.addEventListener("change", () => applyWords(ask.value));
    ask.addEventListener("keydown", (e) => { if (e.key === "Enter") applyWords(ask.value); e.stopPropagation(); });
    host.querySelector(".fl-chips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-chip]"); if (!b) return;
      ask.value = b.dataset.chip; applyWords(ask.value);
    });

    // ─── readout, metrics, export
    function describe() {
      const p = body.params;
      const rows = mode === "spring"
        ? (() => { const m = Feel.metrics(p); return [["stiffness k", r(p.stiffness, 1)], ["damping c", r(p.damping, 2)], ["overshoot", `${r(m.overshoot * 100, 1)}%`], ["settles in", `${Math.round(m.settle * 1000)} ms`], ["coast per 1000 px/s", `${Math.round((1000 * p.mass) / p.damping)} px`]]; })()
        : [["stops", field.stops.join(" · ")], ["click radius", `${field.cfg.clickRadius} px`], ["coast per 1000 px/s", `${Math.round((1000 * p.mass) / p.damping)} px`], ["flick to escape", `${escapeV()} px/s`]];
      metricsEl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
      code.textContent = Feel.exportCode(p, exportKind, body);
      say();
    }
    host.querySelector(".fl-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-ex]"); if (!b) return;
      exportKind = b.dataset.ex;
      host.querySelectorAll("[data-ex]").forEach((x) => x.classList.toggle("is-on", x === b));
      describe();
    });
    host.querySelector(".fl-copy").addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(code.textContent); e.target.textContent = "Copied"; setTimeout(() => (e.target.textContent = "Copy"), 1200); } catch (_) { /* */ }
    });

    // The smallest flick that gets the body out of its current stop's pull.
    function escapeV() {
      if (!field) return "–";
      const here = field.rest(body.x), i = field.stops.indexOf(here);
      const to = field.stops[i > 0 ? i - 1 : i + 1];
      const dir = Math.sign(to - here);
      for (let v = 50; v < 40000; v *= 1.1) if (body.predict(dir * v, here) !== here) return Math.round(v);
      return "> 40000";
    }

    function say() {
      const p = body.params, m = Feel.modal(p);
      const ev = body.events[body.events.length - 1], set = [...body.events].reverse().find((x) => x.kind === "settle");
      let tail = "";
      if (body.hand) tail = "held";
      else if (ev && ev.kind !== "settle") tail = ev.kind === "release" ? `released ${r(ev.v, 0)} px/s → coasts to ${r(ev.projected, 0)}` : "moving";
      else if (set) tail = `settled in ${Math.round(set.after * 1000)} ms`;
      readout.textContent = mode === "spring"
        ? `m ${r(p.mass, 2)} · k ${r(p.stiffness, 0)} · c ${r(p.damping, 1)} · ζ ${r(m.zeta, 2)} · ${r(m.freq, 2)} Hz${tail ? " · " + tail : ""}`
        : `m ${r(p.mass, 2)} · c ${r(p.damping, 1)} · ${field.stops.length} magnets · click ${r(field.cfg.clickFreq, 1)} Hz${tail ? " · " + tail : ""}`;
      live.textContent = `x ${r(body.x, 1)} · v ${r(body.v, 0)} px/s · F ${r(body.force(body.x, body.v, { hand: false }), 0)}`;
      card.setAttribute("aria-label", `${o.title}. ${readout.textContent}`);
    }

    // ─── plots
    function setup(c) {
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.font = "10px ui-monospace, Menlo, monospace";
      return { g, w, h };
    }
    const pad = { l: 8, r: 8, t: 10, b: 14 };

    function windowT() {
      const m = Feel.metrics(body.params);
      const last = body.trace.length ? body.trace[body.trace.length - 1].t : 0;
      return Math.max(0.6, m.settle * 1.6, last * 1.08);
    }

    function drawX() {
      const { g, w, h } = setup(canv.x);
      const T = windowT();
      const span = hi - lo, y0 = lo - span * 0.18, y1 = hi + span * 0.18;
      const X = (t) => pad.l + ((w - pad.l - pad.r) * t) / T;
      const Y = (x) => h - pad.b - ((h - pad.t - pad.b) * (x - y0)) / (y1 - y0);
      // stops and travel
      g.strokeStyle = P.faint; g.lineWidth = 1; g.setLineDash([2, 3]);
      for (const s of o.stops || [lo, hi]) { g.beginPath(); g.moveTo(pad.l, Y(s)); g.lineTo(w - pad.r, Y(s)); g.stroke(); }
      g.setLineDash([]);
      const rest = body.rest();
      if (rest != null) {
        const b = span * 0.02;
        g.fillStyle = P.band; g.fillRect(pad.l, Y(rest + b), w - pad.l - pad.r, Y(rest - b) - Y(rest + b));
      }
      // ghost: what the model predicted the moment it was let go (spring,
      // walls and fields included). The measured line should sit on it.
      const ev = [...body.events].reverse().find((e) => e.kind !== "settle" && e.kind !== "grab" && e.t >= body.eventAt);
      if (ev && !body.hand) {
        if (!ev.path || ev.pathFor !== paramsKey()) { ev.path = body.path(ev.x, ev.v, Math.max(T, 1.5)); ev.pathFor = paramsKey(); }
        const t0 = ev.t - body.eventAt;
        g.strokeStyle = P.ghost; g.lineWidth = 1.2; g.setLineDash([4, 3]); g.beginPath();
        ev.path.forEach(([t, x], i) => (i ? g.lineTo(X(t0 + t), Y(x)) : g.moveTo(X(t0 + t), Y(x))));
        g.stroke(); g.setLineDash([]);
        if (t0 > 0.01) {
          g.strokeStyle = P.faint; g.beginPath(); g.moveTo(X(t0), pad.t); g.lineTo(X(t0), h - pad.b); g.stroke();
          g.fillStyle = P.muted; g.fillText("let go", X(t0) + 4, pad.t + 9);
        }
      }
      // the motion it actually made
      const tr = body.trace;
      if (tr.length > 1) {
        g.strokeStyle = P.lit; g.lineWidth = 1.6; g.beginPath();
        tr.forEach((s, i) => (i ? g.lineTo(X(s.t), Y(s.x)) : g.moveTo(X(s.t), Y(s.x))));
        g.stroke();
        const s = tr[tr.length - 1];
        g.fillStyle = P.lit; g.beginPath(); g.arc(X(s.t), Y(s.x), 2.6, 0, 7); g.fill();
      }
      g.fillStyle = P.muted;
      g.fillText(`${Math.round(T * 1000)} ms`, w - pad.r - 44, h - 2);
      g.fillText("0", pad.l, h - 2);
    }

    function drawV() {
      const { g, w, h } = setup(canv.v);
      const T = windowT();
      const tr = body.trace;
      const vmax = Math.max(200, ...tr.map((s) => Math.abs(s.v))) * 1.15;
      const X = (t) => pad.l + ((w - pad.l - pad.r) * t) / T;
      const Y = (v) => pad.t + ((h - pad.t - pad.b) * (1 - (v + vmax) / (2 * vmax)));
      g.strokeStyle = P.faint; g.lineWidth = 1; g.beginPath(); g.moveTo(pad.l, Y(0)); g.lineTo(w - pad.r, Y(0)); g.stroke();
      if (tr.length > 1) {
        g.strokeStyle = P.text; g.globalAlpha = 0.85; g.lineWidth = 1.3; g.beginPath();
        tr.forEach((s, i) => (i ? g.lineTo(X(s.t), Y(s.v)) : g.moveTo(X(s.t), Y(s.v))));
        g.stroke(); g.globalAlpha = 1;
        let pk = tr[0]; for (const s of tr) if (Math.abs(s.v) > Math.abs(pk.v)) pk = s;
        g.fillStyle = P.muted; g.fillText(`peak ${Math.round(Math.abs(pk.v))} px/s`, pad.l + 2, h - 3);
        g.fillStyle = P.text; g.beginPath(); g.arc(X(pk.t), Y(pk.v), 2.2, 0, 7); g.fill();
      }
    }

    function drawF() {
      const { g, w, h } = setup(canv.f);
      const span = hi - lo, x0 = lo - span * 0.12, x1 = hi + span * 0.12;
      const N = 220, xs = [], fs = [];
      for (let i = 0; i <= N; i++) { const x = x0 + ((x1 - x0) * i) / N; xs.push(x); fs.push(body.force(x, 0, { hand: false })); }
      const inside = fs.filter((_, i) => xs[i] >= lo && xs[i] <= hi);
      const fmax = Math.max(1, ...inside.map(Math.abs)) * 1.25;
      const X = (x) => pad.l + ((w - pad.l - pad.r) * (x - x0)) / (x1 - x0);
      const Y = (f) => pad.t + ((h - pad.t - pad.b) * (1 - (f + fmax) / (2 * fmax)));
      g.strokeStyle = P.faint; g.lineWidth = 1; g.beginPath(); g.moveTo(pad.l, Y(0)); g.lineTo(w - pad.r, Y(0)); g.stroke();
      g.setLineDash([2, 3]);
      for (const s of o.stops || [lo, hi]) { g.beginPath(); g.moveTo(X(s), pad.t); g.lineTo(X(s), h - pad.b); g.stroke(); }
      g.setLineDash([]);
      g.save(); g.beginPath(); g.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b); g.clip();
      g.strokeStyle = P.text; g.globalAlpha = 0.85; g.lineWidth = 1.3; g.beginPath();
      xs.forEach((x, i) => (i ? g.lineTo(X(x), Y(fs[i])) : g.moveTo(X(x), Y(fs[i]))));
      g.stroke(); g.globalAlpha = 1; g.restore();
      const fNow = Math.max(-fmax, Math.min(fmax, body.force(body.x, 0, { hand: false })));
      g.fillStyle = P.lit; g.beginPath(); g.arc(X(body.x), Y(fNow), 3.2, 0, 7); g.fill();
      g.fillStyle = P.muted; g.fillText("pulls back ↑ / ↓", pad.l, h - 2);
    }

    function drawAll() { drawX(); drawV(); drawF(); say(); }

    // Chain onto the body's frame callback so plots follow every step.
    const prevFrame = body.onFrame, prevSettle = body.onSettle;
    body.onFrame = (b) => { prevFrame && prevFrame(b); drawAll(); };
    body.onSettle = (b) => { prevSettle && prevSettle(b); drawAll(); };

    // ─── keys and actions
    const acts = o.actions || [];
    host.querySelector(".fl-keys").addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b) acts[+b.dataset.act].run(); });
    card.addEventListener("keydown", (e) => {
      const k = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const a = acts.find((x) => x.key === k);
      if (a) { a.run(); e.preventDefault(); }
    });

    new ResizeObserver(() => drawAll()).observe(host.querySelector(".fl-plots"));
    if (global.matchMedia) global.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { P = palette(); drawAll(); });

    if (o.feel) applyWords(o.feel); else { syncDials(); describe(); }
    drawAll();
    return { host, body, apply, applyWords, redraw: drawAll };
  }

  Feel.rig = rig;
})(typeof window !== "undefined" ? window : globalThis);
