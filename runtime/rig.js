/*! Feel rig v0.2 · MIT
 *
 * A test bench for one body: the live component on the left, and on the right
 * the motion it just made (position and velocity over time, with the exact
 * solution as a dashed ghost), the force field it lives in, and a readout.
 * A Body2D gets a plane instead: its path over the predicted ghost, its speed,
 * and the field drawn as arrows. The margin holds the feel words, the dials,
 * the keys and a switch between the JS loop and CSS keyframes (Feel.handoff).
 * Under the figure: what the motion measures, and the same motion exported to
 * other libraries.
 *
 * The controls follow Fluid Functionalism (fluidfunctionalism.com, MIT): fluid
 * hover, subtle tabs, the scrubber slider and the copy button, ported to plain
 * DOM. Everything in them that moves is a Feel spring.
 *
 * Requires feel.js. Exposes Feel.rig(host, options) and Feel.ui.
 */
(function (global) {
  "use strict";
  const Feel = global.Feel;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const r = (n, d = 1) => (Number.isFinite(n) ? Number(n.toFixed(d)) : "–");
  const CHIPS = ["heavy", "snappy", "bouncy", "soft", "light", "stiff", "wobbly", "precise"];
  const EXPORTS = [["framer", "Framer Motion"], ["react-spring", "react-spring"], ["swiftui", "SwiftUI"], ["compose", "Compose"], ["css", "CSS"]];

  // ───────────────────────────────────────────── controls (after Fluid Functionalism)

  // Its three motion tiers, as springs. There, `duration` is the time a spring
  // takes to settle within 0.1%, which a critically damped one reaches at
  // ωt ≈ 9.2: fast (0.08 s) is 18 Hz, moderate (0.16 s) is 9 Hz, and slow
  // (0.24 s, bounce 0.12) is 6 Hz at ζ 0.88.
  const SPRING = { fast: { mass: 1, freq: 18, zeta: 1 }, moderate: { mass: 1, freq: 9, zeta: 1 }, slow: { mass: 1, freq: 6, zeta: 0.88 } };

  const ICON = {
    copy: `<svg class="ff-i ff-i-idle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    done: `<svg class="ff-i ff-i-done" viewBox="2 4 20 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12L10 16L18 8"/></svg>`,
    fail: `<svg class="ff-i ff-i-fail" viewBox="2 4 20 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9L15 15M15 9L9 15"/></svg>`,
  };

  // A label that keeps its width when its weight changes: an invisible copy at
  // the heaviest weight it takes (or the widest text it shows) holds the box.
  const label = (text, widest = text, same = false) =>
    `<span class="ff-t${same ? " ff-same" : ""}"><span class="ff-ghost" aria-hidden="true">${esc(widest)}</span><span class="ff-label">${esc(text)}</span></span>`;

  // A highlight that springs between rects: position, size and opacity are
  // three bodies, painted together.
  function pill(parent, cls) {
    const el = document.createElement("span");
    el.className = cls;
    el.setAttribute("aria-hidden", "true");
    parent.prepend(el);
    const pos = new Feel.Body2D({ ...SPRING.fast, restX: 0.05, restV: 1 });
    const size = new Feel.Body2D({ ...SPRING.fast, restX: 0.05, restV: 1 });
    const alpha = new Feel.Body({ ...SPRING.fast, x: 0, target: 0, restX: 0.002, restV: 0.02, unit: "" });
    const paint = () => {
      el.style.transform = `translate(${pos.x.toFixed(2)}px, ${pos.y.toFixed(2)}px)`;
      el.style.width = `${Math.max(0, size.x).toFixed(2)}px`;
      el.style.height = `${Math.max(0, size.y).toFixed(2)}px`;
      el.style.opacity = Math.max(0, Math.min(1, alpha.x)).toFixed(3);
    };
    pos.onFrame = size.onFrame = alpha.onFrame = paint;
    const use = (b, tier) => { if (b.tier !== tier) { b.params = SPRING[tier]; b.tier = tier; } };
    for (const b of [pos, size, alpha]) b.tier = "fast";
    return {
      el,
      get seen() { return alpha.x > 0.02 || alpha.target > 0; },
      jump(q) { pos.jump({ x: q.left, y: q.top }); size.jump({ x: q.width, y: q.height }); },
      to(q, tier = "fast") { use(pos, tier); use(size, tier); pos.to({ x: q.left, y: q.top }); size.to({ x: q.width, y: q.height }); },
      fade(a, tier = "fast") { use(alpha, tier); if (alpha.target !== a) alpha.to(a); },
    };
  }

  // Fluid hover: one highlight glides to the item nearest the pointer, so the
  // gaps between items never drop it, and a click in a gap lands on what is
  // lit. `axis` is "y" for a list, "x" for a row, "xy" for a wrapping grid.
  // With `tabs`, a second pill marks the selected item and follows it.
  function fluid(box, o = {}) {
    const axis = o.axis || "y", tabs = !!o.tabs;
    box.classList.add("ff-fluid");
    const items = () => [...box.children].filter((el) => el.classList.contains("ff-item"));
    const hover = pill(box, "ff-hl");
    const chosen = tabs ? pill(box, "ff-hl ff-hl-sel") : null;
    let lit = null, inside = false, sel = null;

    const rect = (el) => {
      const b = box.getBoundingClientRect(), q = el.getBoundingClientRect();
      return { left: q.left - b.left - box.clientLeft + box.scrollLeft, top: q.top - b.top - box.clientTop + box.scrollTop, width: q.width, height: q.height };
    };
    // The item nearest the pointer by its edge, so one under the pointer is at 0 and wins.
    function pick(px, py) {
      let best = null, bestD = Infinity;
      items().forEach((el, i) => {
        if (el.disabled) return;
        const q = el.getBoundingClientRect();
        const dx = Math.max(q.left - px, 0, px - q.right), dy = Math.max(q.top - py, 0, py - q.bottom);
        const d = axis === "xy" ? Math.hypot(dx, dy) : axis === "x" ? dx : dy;
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }

    function light(i) {
      const list = items();
      if (lit != null && list[lit]) list[lit].removeAttribute("data-active");
      lit = i != null && list[i] ? i : null;
      const home = chosen && sel != null && list[sel] ? rect(list[sel]) : null;
      if (lit == null) {
        // Tabs: the hover pill folds back into the selected one.
        if (home) { hover.to(home, "moderate"); hover.fade(0, "moderate"); chosen.fade(1); } else hover.fade(0);
        return;
      }
      list[lit].setAttribute("data-active", "");
      if (chosen && lit === sel) { hover.fade(0); chosen.fade(1); return; }
      const q = rect(list[lit]);
      // A fresh entry starts at the selected tab, or appears where it lands.
      if (!hover.seen) hover.jump(home || q);
      hover.to(q);
      hover.fade(chosen ? 0.4 : 1);
      if (chosen) chosen.fade(0.8);
    }

    function select(i) {
      const list = items();
      sel = i != null && list[i] ? i : null;
      list.forEach((el, j) => {
        const on = j === sel;
        el.classList.toggle("is-on", on);
        if (tabs) { el.setAttribute("aria-selected", String(on)); el.tabIndex = on || (sel == null && j === 0) ? 0 : -1; }
      });
      if (!chosen) return;
      if (sel == null) return chosen.fade(0);
      const q = rect(list[sel]);
      if (!chosen.seen) chosen.jump(q);
      chosen.to(q, "moderate");
      chosen.fade(lit != null && lit !== sel ? 0.8 : 1);
      if (lit === sel) hover.fade(0);
    }

    box.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      inside = true;
      const i = pick(e.clientX, e.clientY);
      if (i !== lit) light(i);
    });
    box.addEventListener("pointerleave", () => { inside = false; light(null); });
    box.addEventListener("focusin", (e) => {
      const el = e.target.closest(".ff-item");
      if (el && el.parentElement === box && el.matches(":focus-visible")) light(items().indexOf(el));
    });
    box.addEventListener("focusout", (e) => { if (!box.contains(e.relatedTarget) && !inside) light(null); });
    box.addEventListener("click", (e) => {
      const el = e.target.closest(".ff-item");
      if (!el) { if (lit != null) items()[lit].click(); return; }
      if (tabs && el.parentElement === box) { const i = items().indexOf(el); select(i); o.onSelect && o.onSelect(i, el); }
    });
    if (tabs) {
      box.setAttribute("role", "tablist");
      // Arrows move focus; Enter or Space picks, as a button does.
      box.addEventListener("keydown", (e) => {
        const list = items(), i = list.indexOf(document.activeElement);
        if (i < 0) return;
        const n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
        if (n == null) return;
        e.preventDefault();
        list[(n + list.length) % list.length].focus();
      });
    }
    // Layout moves the items under the pills (fonts arriving, a wrap): follow without a slide.
    const ro = new ResizeObserver(() => {
      const list = items();
      if (chosen && sel != null && list[sel]) chosen.jump(rect(list[sel]));
      if (lit != null && list[lit]) hover.jump(rect(list[lit]));
    });
    ro.observe(box);
    items().forEach((el) => ro.observe(el));
    if (o.selected != null) select(o.selected);
    return { select, light, get selected() { return sel; } };
  }

  // The scrubber slider: a bordered row whose fill is the value, label on the
  // left and number on the right. A native range input on top owns focus,
  // keys and ARIA. A press springs the fill to where it landed, a drag carries
  // it directly, and the keys step it by 1%.
  function slider(row) {
    const input = row.querySelector("input");
    const max = +input.max || 1000;
    const b = new Feel.Body({ ...SPRING.fast, x: +input.value, target: +input.value, restX: 0.5, restV: 5, unit: "" });
    const paint = () => row.style.setProperty("--p", (Math.max(0, Math.min(max, b.x)) / max).toFixed(4));
    b.onFrame = paint;
    paint();
    let held = false, moved = false;
    const up = () => { held = false; };
    input.addEventListener("pointerdown", () => { held = true; moved = false; row.classList.remove("is-hover"); });
    global.addEventListener("pointerup", up);
    global.addEventListener("pointercancel", up);
    input.addEventListener("pointermove", (e) => {
      if (held) { moved = true; return; }
      if (e.pointerType !== "mouse") return;
      // Preview what a press would change: from the fill's edge to the pointer.
      const q = row.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - q.left) / q.width)), p = b.x / max;
      row.style.setProperty("--hl", Math.min(f, p).toFixed(4));
      row.style.setProperty("--hw", Math.abs(f - p).toFixed(4));
      row.classList.add("is-hover");
    });
    input.addEventListener("pointerleave", () => row.classList.remove("is-hover"));
    input.addEventListener("input", () => { const v = +input.value; if (held && moved) b.jump(v); else b.to(v); });
    input.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 10, ArrowUp: 10, ArrowLeft: -10, ArrowDown: -10, PageUp: 100, PageDown: -100 }[e.key];
      const to = e.key === "Home" ? 0 : e.key === "End" ? max : step != null ? +input.value + step : null;
      if (to == null) return;
      e.preventDefault();
      input.value = Math.max(0, Math.min(max, to));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return {
      // A value set from outside (words, a preset) springs there; the one under the pointer is left alone.
      set(v) { if (held || (v === b.target && b.atRest())) return; b.to(v); },
    };
  }

  // Copy on click. The icon swaps to a check (or a ×) that springs in, and the
  // label, if any, says what happened; both go back after 2 s.
  function copy(btn, text) {
    const pop = new Feel.Body({ ...SPRING.fast, x: 1, target: 1, restX: 0.002, restV: 0.02, unit: "" });
    pop.onFrame = () => btn.style.setProperty("--pop", pop.x.toFixed(3));
    const name = btn.querySelector(".ff-label");
    const idle = name ? name.textContent : "";
    const aria = btn.getAttribute("aria-label");
    let timer = 0;
    const fallback = (s) => {
      const ta = document.createElement("textarea");
      ta.value = s; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, s.length);
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
      ta.remove();
      return ok;
    };
    btn.addEventListener("click", async () => {
      const s = text();
      let ok = true;
      try { await navigator.clipboard.writeText(s); } catch (_) { ok = fallback(s); }
      btn.classList.toggle("is-done", ok);
      btn.classList.toggle("is-fail", !ok);
      if (name) name.textContent = ok ? "Copied" : "Failed";
      btn.setAttribute("aria-label", ok ? "Copied" : "Copy failed");
      pop.jump(0.6); pop.to(1);
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.classList.remove("is-done", "is-fail");
        if (name) name.textContent = idle;
        if (aria) btn.setAttribute("aria-label", aria); else btn.removeAttribute("aria-label");
      }, 2000);
    });
  }

  Feel.ui = { SPRING, ICON, label, fluid, slider, copy };

  // ───────────────────────────────────────────── the rig

  function rig(host, o) {
    const body = o.body;
    const theme = o.theme || "light";
    const plane = body.dims === 2;
    const unit = o.unit || body.unit || "px";
    const per = `${unit}/s`;
    const u = (v) => (unit === "°" ? `${v}°` : `${v} ${unit}`);
    const xName = unit === "°" ? "θ" : "x";
    const [lo, hi] = plane ? [0, 1] : o.travel;
    // A body with a target is a spring; a body with no target lives in a field.
    const field = body.target == null ? body.forces.find((f) => f.kind === "magnets" || f.kind === "points") : null;
    const mode = field ? "field" : "spring";
    const acts = o.actions || [];
    const legend = `<i>— measured</i> <i class="fl-dash">┄ predicted</i>`;
    const labels = plane
      ? [`path · ${esc(unit)} · ${legend}`, `speed · ${esc(per)}`, "force field · F(x, y) at rest"]
      : [`${unit === "°" ? "angle" : "position"} · ${esc(unit)} · ${legend}`, `velocity · ${esc(per)}`, `force field · F(${xName}) at rest`];
    host.classList.add("fl");
    host.setAttribute("data-theme", theme);
    host.innerHTML = `
      <div class="fl-card" tabindex="0" role="group">
        <div class="fl-corner fl-tl">Fig. ${esc(o.fig || 1)}</div>
        <div class="fl-corner fl-tr">${esc(o.title || "Rig")}</div>
        <div class="fl-grid${plane ? " fl-plane" : ""}">
          <div class="fl-bench"><div class="fl-stage"></div><div class="fl-live"></div></div>
          <div class="fl-plots${plane ? " fl-plane" : ""}">
            <div class="fl-plot"><span class="fl-plot-label">${labels[0]}</span><canvas data-plot="x"></canvas></div>
            <div class="fl-plot"><span class="fl-plot-label">${labels[1]}</span><canvas data-plot="v"></canvas></div>
            <div class="fl-plot"><span class="fl-plot-label">${labels[2]}</span><canvas data-plot="f"></canvas></div>
          </div>
        </div>
        <div class="fl-corner fl-bl fl-hint">${esc(o.hint || "Drag it · flick it")}</div>
        <div class="fl-corner fl-br fl-readout" aria-live="polite"></div>
      </div>
      <div class="fl-foot">
        <section class="fl-sec">
          <span class="fl-label">Measures</span>
          <dl class="fl-metrics"></dl>
        </section>
        <section class="fl-sec fl-export">
          <span class="fl-label">Export</span>
          <div class="ff-tabs" aria-label="Export to">${EXPORTS.map(([k, l]) => `<button type="button" class="ff-item" role="tab" data-ex="${k}">${label(l)}</button>`).join("")}</div>
          <div class="fl-code-wrap">
            <pre class="ff-code fl-code" tabindex="0"></pre>
            <button type="button" class="ff-btn ff-ghost ff-square fl-copy" aria-label="Copy code"><span class="ff-icons">${ICON.copy}${ICON.done}${ICON.fail}</span></button>
          </div>
        </section>
      </div>
      <div class="fl-margin">
        <section class="fl-sec">
          <span class="fl-label">Feel</span>
          <label class="ff-input"><input type="text" spellcheck="false" aria-label="How it should feel" value="${esc(o.feel || "")}" placeholder="heavy, snappy, bouncy…"></label>
          <div class="fl-chips">${CHIPS.map((c) => `<button type="button" class="ff-item" data-chip="${c}">${label(c)}</button>`).join("")}</div>
          <div class="fl-words" aria-live="polite"></div>
        </section>
        <section class="fl-sec">
          <span class="fl-label">Tune</span>
          <div class="fl-dials">
            ${mode === "spring"
              ? dial("mass", "mass", 0.15, 8, true) + dial("freq", "frequency", 0.4, 7, true, "Hz") + dial("zeta", "damping ratio", 0.1, 1.6, false)
              : dial("mass", "mass", 0.15, 8, true) + dial("damping", "damping c", 2, 160, true) + dial("click", "magnet click", 1, 14, true, "Hz") + dial("reach", "magnet reach", 0.2, 3, true, "Hz")}
          </div>
        </section>
        ${acts.length ? `<section class="fl-sec">
          <span class="fl-label">Keys</span>
          <div class="fl-keys">${acts.map((a, i) => `<button type="button" class="ff-item" data-act="${i}"><kbd class="ff-kbd">${esc(a.key)}</kbd><span>${esc(a.label)}</span></button>`).join("")}</div>
        </section>` : ""}
        ${o.handoff ? `<section class="fl-sec fl-run">
          <span class="fl-label">Runs on</span>
          <div class="ff-tabs" aria-label="Runs on"><button type="button" class="ff-item" role="tab" data-run="js">${label("JS loop")}</button><button type="button" class="ff-item" role="tab" data-run="css">${label("CSS keyframes")}</button></div>
          <p class="fl-bake"></p>
        </section>` : ""}
      </div>`;

    function dial(key, name, min, max, log, unitLabel = "") {
      return `<div class="ff-slider" data-dial="${key}" data-unit="${esc(unitLabel)}">`
        + `<span class="ff-slider-fill"></span><span class="ff-slider-preview"></span><span class="ff-slider-line"></span>`
        + `<span class="ff-slider-label">${esc(name)}</span><span class="ff-slider-value"><output></output>${unitLabel ? `<em>${esc(unitLabel)}</em>` : ""}</span>`
        + `<input type="range" min="0" max="1000" aria-label="${esc(name)}" data-min="${min}" data-max="${max}" data-log="${log ? 1 : 0}"></div>`;
    }

    host.querySelector(".fl-stage").appendChild(o.stage);
    const card = host.querySelector(".fl-card");
    const readout = host.querySelector(".fl-readout");
    const live = host.querySelector(".fl-live");
    const ask = host.querySelector(".ff-input input");
    const wordsEl = host.querySelector(".fl-words");
    const chips = [...host.querySelectorAll("[data-chip]")];
    const metricsEl = host.querySelector(".fl-metrics");
    const code = host.querySelector(".fl-code");
    const bakeEl = host.querySelector(".fl-bake");
    const canv = Object.fromEntries([...host.querySelectorAll("canvas")].map((c) => [c.dataset.plot, c]));
    let exportKind = "framer";
    const paramsKey = () => `${body.mass}|${body.stiffness}|${body.damping}|${JSON.stringify(body.target)}|${field ? `${field.cfg.clickFreq}|${field.cfg.reachFreq}` : ""}`;
    const palette = () => {
      const cs = getComputedStyle(host);
      return { lit: cs.getPropertyValue("--fl-lit").trim(), text: cs.getPropertyValue("--fl-text").trim(), muted: cs.getPropertyValue("--fl-muted").trim(), line: cs.getPropertyValue("--fl-line").trim(), faint: cs.getPropertyValue("--fl-faint").trim(), band: cs.getPropertyValue("--fl-band").trim(), ghost: cs.getPropertyValue("--fl-ghost").trim() };
    };
    let P = palette();

    // ─── margin controls
    fluid(host.querySelector(".fl-chips"), { axis: "xy" });
    if (acts.length) fluid(host.querySelector(".fl-keys"), { axis: "y" });
    const exportTabs = fluid(host.querySelector(".fl-export .ff-tabs"), {
      axis: "xy", tabs: true, selected: 0,
      onSelect: (i, el) => { exportKind = el.dataset.ex; describe(); },
    });
    copy(host.querySelector(".fl-copy"), () => code.textContent);

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
    const rows = Object.fromEntries([...host.querySelectorAll(".ff-slider")].map((d) => [d.dataset.dial, d]));
    const dials = Object.fromEntries(Object.entries(rows).map(([k, d]) => [k, d.querySelector("input")]));
    const fills = Object.fromEntries(Object.entries(rows).map(([k, d]) => [k, slider(d)]));

    function syncDials() {
      const vals = mode === "spring"
        ? (() => { const m = Feel.modal(body.params); return { mass: m.mass, freq: m.freq, zeta: m.zeta }; })()
        : { mass: body.mass, damping: body.damping, click: field.cfg.clickFreq, reach: field.cfg.reachFreq };
      for (const [k, v] of Object.entries(vals)) {
        toSlider(dials[k], v);
        fills[k].set(+dials[k].value);
        rows[k].querySelector("output").textContent = r(v, 2);
        dials[k].setAttribute("aria-valuetext", `${r(v, 2)}${rows[k].dataset.unit ? " " + rows[k].dataset.unit : ""}`);
      }
    }

    function apply(p, from) {
      body.params = p;
      o.onParams && o.onParams(body.params, from);
      syncDials(); describe(); drawAll();
    }

    for (const el of Object.values(dials)) {
      el.addEventListener("input", () => {
        if (ask.value) { ask.value = ""; showWords(null); }
        if (mode === "spring") return apply(Feel.fromModal({ mass: fromSlider(dials.mass), freq: fromSlider(dials.freq), zeta: fromSlider(dials.zeta) }), "dial");
        field.cfg.clickFreq = fromSlider(dials.click); field.cfg.reachFreq = fromSlider(dials.reach);
        apply({ mass: fromSlider(dials.mass), stiffness: body.stiffness, damping: fromSlider(dials.damping) }, "dial");
      });
    }

    // ─── words
    function showWords(w) {
      for (const c of chips) c.classList.toggle("is-on", !!w && w.words.includes(c.dataset.chip));
      if (!w) { wordsEl.innerHTML = `<span class="fl-note">Tuned by hand.</span>`; return; }
      const known = w.words.map((x) => `<span class="ff-badge">${esc(x)}</span>`).join("");
      const odd = w.unknown.map((x) => `<span class="ff-badge is-red">${esc(x)}</span>`).join("");
      wordsEl.innerHTML = known + odd
        + (w.unknown.length ? `<span class="fl-note">${w.unknown.length > 1 ? "aren't" : "isn't"} in the vocabulary</span>` : "")
        + (!known && !odd ? `<span class="fl-note">Type how it should feel.</span>` : "");
    }

    function applyWords(text) {
      const w = Feel.words(text);
      showWords(w);
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
    function stopsText() {
      const s = field.stops;
      if (plane) return `${s.length} points`;
      return s.length > 4 ? `${s.length} · ${u(r(s[1] - s[0], 1))} apart` : s.map((x) => r(x, 1)).join(" · ");
    }

    function describe() {
      const p = body.params;
      const coast = [`coast per 1000 ${per}`, u(Math.round((1000 * p.mass) / p.damping))];
      const list = mode === "spring"
        ? (() => { const m = Feel.metrics(p); return [["stiffness k", r(p.stiffness, 1)], ["damping c", r(p.damping, 2)], ["overshoot", `${r(m.overshoot * 100, 1)}%`], ["settles in", `${Math.round(m.settle * 1000)} ms`], coast]; })()
        : [["stops", stopsText()], ["click radius", u(r(field.cfg.clickRadius, 1))], coast, ["flick to escape", `${escapeV()} ${per}`]];
      metricsEl.innerHTML = list.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
      code.textContent = Feel.exportCode(p, exportKind, body);
      say();
    }

    // The smallest flick that gets the body out of its current stop's pull,
    // toward the nearest other stop.
    function escapeV() {
      if (!field) return "–";
      if (plane) {
        const here = field.rest(body.x, body.y);
        const to = field.stops.filter((s) => s !== here).reduce((a, s) => (Math.hypot(s.x - here.x, s.y - here.y) < Math.hypot(a.x - here.x, a.y - here.y) ? s : a));
        const d = Math.hypot(to.x - here.x, to.y - here.y), ux = (to.x - here.x) / d, uy = (to.y - here.y) / d;
        for (let v = 50; v < 40000; v *= 1.1) if (body.predict(ux * v, uy * v, here.x, here.y) !== here) return Math.round(v);
        return "> 40000";
      }
      const here = field.rest(body.x), i = field.stops.indexOf(here);
      const to = field.stops[i > 0 ? i - 1 : i + 1];
      const dir = Math.sign(to - here);
      for (let v = 50; v < 40000; v *= 1.1) if (body.predict(dir * v, here) !== here) return Math.round(v);
      return "> 40000";
    }

    const speedOf = (e) => (plane ? Math.hypot(e.vx, e.vy) : e.v);
    const where = (p) => (plane ? `(${r(p.x, 0)}, ${r(p.y, 0)})` : unit === "°" ? `${r(p, 0)}°` : r(p, 0));

    function say() {
      const p = body.params, m = Feel.modal(p);
      const ev = body.events[body.events.length - 1], set = [...body.events].reverse().find((x) => x.kind === "settle");
      let tail = "";
      if (body.hand) tail = "held";
      else if (ev && ev.kind !== "settle") tail = ev.kind === "release" ? `released ${r(speedOf(ev), 0)} ${per} → coasts to ${where(ev.projected)}` : "moving";
      else if (set) tail = `settled in ${Math.round(set.after * 1000)} ms`;
      readout.textContent = mode === "spring"
        ? `m ${r(p.mass, 2)} · k ${r(p.stiffness, 0)} · c ${r(p.damping, 1)} · ζ ${r(m.zeta, 2)} · ${r(m.freq, 2)} Hz${tail ? " · " + tail : ""}`
        : `m ${r(p.mass, 2)} · c ${r(p.damping, 1)} · ${field.stops.length} magnets · click ${r(field.cfg.clickFreq, 1)} Hz${tail ? " · " + tail : ""}`;
      live.textContent = plane
        ? `x ${r(body.x, 1)} · y ${r(body.y, 1)} · |v| ${r(body.speed, 0)} ${per} · |F| ${r(Math.hypot(...body.force(body.x, body.y, body.vx, body.vy, { hand: false })), 0)}`
        : `${xName} ${r(body.x, 1)} · v ${r(body.v, 0)} ${per} · F ${r(body.force(body.x, body.v, { hand: false }), 0)}`;
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

    // The ghost is what the model predicted the moment it was let go (spring,
    // walls and fields included). The measured line should sit on it.
    const ghostEvent = () => [...body.events].reverse().find((e) => e.kind !== "settle" && e.kind !== "grab" && e.t >= body.eventAt);

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
      const ev = ghostEvent();
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
        g.fillStyle = P.muted; g.fillText(`peak ${Math.round(Math.abs(pk.v))} ${per}`, pad.l + 2, h - 3);
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

    // ─── plane plots (Body2D)
    // One scale for both axes, so a diagonal throw looks diagonal.
    function box(w, h) {
      const [x0, x1] = o.travel.x, [y0, y1] = o.travel.y;
      const mx = (x1 - x0) * 0.06 + 2, my = (y1 - y0) * 0.06 + 2;
      const s = Math.min((w - pad.l - pad.r) / (x1 - x0 + 2 * mx), (h - pad.t - pad.b) / (y1 - y0 + 2 * my));
      const cx = (pad.l + w - pad.r) / 2, cy = (pad.t + h - pad.b) / 2;
      return { s, x0, x1, y0, y1, X: (x) => cx + (x - (x0 + x1) / 2) * s, Y: (y) => cy + (y - (y0 + y1) / 2) * s };
    }

    function frame(g, B, hot) {
      g.lineWidth = 1; g.strokeStyle = P.faint; g.setLineDash([2, 3]);
      g.strokeRect(B.X(B.x0), B.Y(B.y0), (B.x1 - B.x0) * B.s, (B.y1 - B.y0) * B.s);
      g.setLineDash([]);
      for (const p of field ? field.stops : body.target ? [body.target] : []) {
        g.beginPath(); g.arc(B.X(p.x), B.Y(p.y), Math.max(3, (field ? field.cfg.clickRadius : 6) * B.s), 0, 7);
        if (hot && hot.x === p.x && hot.y === p.y) { g.fillStyle = P.band; g.fill(); }
        g.strokeStyle = P.faint; g.stroke();
      }
    }

    function drawPath() {
      const { g, w, h } = setup(canv.x);
      const B = box(w, h), { X, Y } = B;
      frame(g, B, body.rest());
      const ev = ghostEvent();
      if (ev && !body.hand) {
        if (!ev.path || ev.pathFor !== paramsKey()) { ev.path = body.path({ x: ev.x, y: ev.y, vx: ev.vx, vy: ev.vy }, Math.max(windowT(), 1.5)); ev.pathFor = paramsKey(); }
        g.strokeStyle = P.ghost; g.lineWidth = 1.2; g.setLineDash([4, 3]); g.beginPath();
        ev.path.forEach(([, x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke(); g.setLineDash([]);
        if (ev.t - body.eventAt > 0.01) {
          g.strokeStyle = P.muted; g.beginPath(); g.arc(X(ev.x), Y(ev.y), 3, 0, 7); g.stroke();
          g.fillStyle = P.muted; g.fillText("let go", X(ev.x) + 6, Y(ev.y) - 5);
        }
      }
      const tr = body.trace;
      if (tr.length > 1) {
        g.strokeStyle = P.lit; g.lineWidth = 1.6; g.beginPath();
        tr.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))));
        g.stroke();
      }
      g.fillStyle = P.lit; g.beginPath(); g.arc(X(body.x), Y(body.y), 2.8, 0, 7); g.fill();
      g.fillStyle = P.muted; g.fillText(`${r(B.x1 - B.x0, 0)} × ${r(B.y1 - B.y0, 0)} ${unit}`, pad.l, h - 2);
    }

    function drawSpeed() {
      const { g, w, h } = setup(canv.v);
      const T = windowT(), tr = body.trace;
      const sp = tr.map((p) => Math.hypot(p.vx, p.vy));
      const vmax = Math.max(200, ...sp) * 1.15;
      const X = (t) => pad.l + ((w - pad.l - pad.r) * t) / T;
      const Y = (v) => h - pad.b - ((h - pad.t - pad.b) * v) / vmax;
      g.strokeStyle = P.faint; g.lineWidth = 1; g.beginPath(); g.moveTo(pad.l, Y(0)); g.lineTo(w - pad.r, Y(0)); g.stroke();
      if (tr.length > 1) {
        g.strokeStyle = P.text; g.globalAlpha = 0.85; g.lineWidth = 1.3; g.beginPath();
        tr.forEach((p, i) => (i ? g.lineTo(X(p.t), Y(sp[i])) : g.moveTo(X(p.t), Y(sp[i]))));
        g.stroke(); g.globalAlpha = 1;
        let k = 0; sp.forEach((v, i) => { if (v > sp[k]) k = i; });
        g.fillStyle = P.muted; g.fillText(`peak ${Math.round(sp[k])} ${per}`, pad.l + 2, h - 3);
        g.fillStyle = P.text; g.beginPath(); g.arc(X(tr[k].t), Y(sp[k]), 2.2, 0, 7); g.fill();
      }
    }

    // The field as arrows on a grid: direction of the pull at rest, length by
    // the square root of its strength so the far reach still shows.
    function drawQuiver() {
      const { g, w, h } = setup(canv.f);
      const B = box(w, h), { X, Y } = B;
      const nx = 10, ny = Math.max(4, Math.round((nx * (B.y1 - B.y0)) / Math.max(1, B.x1 - B.x0)));
      const cell = Math.min(((B.x1 - B.x0) * B.s) / nx, ((B.y1 - B.y0) * B.s) / ny);
      const grid = [];
      let fmax = 1e-9;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const x = B.x0 + ((i + 0.5) * (B.x1 - B.x0)) / nx, y = B.y0 + ((j + 0.5) * (B.y1 - B.y0)) / ny;
        const [fx, fy] = body.force(x, y, 0, 0, { hand: false }), m = Math.hypot(fx, fy);
        fmax = Math.max(fmax, m); grid.push([x, y, fx, fy, m]);
      }
      frame(g, B, null);
      g.strokeStyle = P.text; g.globalAlpha = 0.7; g.lineWidth = 1.1;
      for (const [x, y, fx, fy, m] of grid) {
        if (m < 1e-6) continue;
        const L = 0.85 * cell * Math.sqrt(m / fmax), ux = fx / m, uy = fy / m, hl = Math.min(4, L * 0.4);
        const ax = X(x) - (ux * L) / 2, ay = Y(y) - (uy * L) / 2, bx = ax + ux * L, by = ay + uy * L;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by);
        g.moveTo(bx, by); g.lineTo(bx - hl * (ux * 0.866 - uy * 0.5), by - hl * (uy * 0.866 + ux * 0.5));
        g.moveTo(bx, by); g.lineTo(bx - hl * (ux * 0.866 + uy * 0.5), by - hl * (uy * 0.866 - ux * 0.5));
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = P.lit; g.beginPath(); g.arc(X(body.x), Y(body.y), 3.2, 0, 7); g.fill();
      g.fillStyle = P.muted; g.fillText("pulls toward each stop", pad.l, h - 2);
    }

    function drawAll() {
      if (plane) { drawPath(); drawSpeed(); drawQuiver(); } else { drawX(); drawV(); drawF(); }
      say();
    }

    // ─── JS loop or CSS keyframes
    // In CSS mode nothing steps the body per frame, so the rig samples it
    // itself, and reads the element back (handoff `read`) for the measured
    // line: that's what the browser really played.
    let cssOn = false, lastBake = null, watching = 0, runTabs = null;
    function bakeText() {
      if (!bakeEl) return;
      bakeEl.textContent = !cssOn ? "JavaScript steps the body every frame."
        : lastBake ? `Last release: ${lastBake.keys.length} keyframes over ${Math.round(lastBake.duration * 1000)} ms, played by the browser.`
        : "Each release is baked once and played by the browser.";
    }
    function watch() {
      if (watching) return;
      const tick = () => {
        watching = 0;
        if (!body.baked) return;
        body.sample();
        const m = body.handoff && body.handoff.read ? body.handoff.read() : null;
        body.record(m == null ? {} : plane ? { x: m.x, y: m.y } : { x: m });
        drawAll();
        watching = requestAnimationFrame(tick);
      };
      watching = requestAnimationFrame(tick);
    }
    function setRun(on) {
      if (cssOn === !!on && runTabs && runTabs.selected != null) return;
      cssOn = !!on;
      o.handoff && o.handoff(cssOn);
      runTabs && runTabs.select(cssOn ? 1 : 0);
      bakeText();
    }
    if (o.handoff) {
      runTabs = fluid(host.querySelector(".fl-run .ff-tabs"), { axis: "x", tabs: true, selected: 0, onSelect: (i) => setRun(i === 1) });
      bakeText();
    }

    // Chain onto the body's callbacks so plots follow every step and bake.
    const prevFrame = body.onFrame, prevSettle = body.onSettle, prevBake = body.onBake;
    body.onFrame = (b) => { prevFrame && prevFrame(b); drawAll(); };
    body.onSettle = (b) => { prevSettle && prevSettle(b); drawAll(); };
    body.onBake = (b, baked) => { prevBake && prevBake(b, baked); lastBake = baked; bakeText(); watch(); };

    // ─── keys and actions
    if (acts.length) host.querySelector(".fl-keys").addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b) acts[+b.dataset.act].run(); });
    card.addEventListener("keydown", (e) => {
      // The component owns its keys. A key it already handled (the toggle's
      // own Space, say) bubbles up here too, and must not run a second time.
      if (e.defaultPrevented) return;
      const k = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const a = acts.find((x) => x.key === k);
      if (a) { a.run(); e.preventDefault(); }
    });

    new ResizeObserver(() => drawAll()).observe(host.querySelector(".fl-plots"));
    if (global.matchMedia) global.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { P = palette(); drawAll(); });

    if (o.feel) applyWords(o.feel); else { showWords(Feel.words("")); syncDials(); describe(); }
    drawAll();
    return { host, body, apply, applyWords, redraw: drawAll, run: setRun, exportTabs };
  }

  Feel.rig = rig;
})(typeof window !== "undefined" ? window : globalThis);
