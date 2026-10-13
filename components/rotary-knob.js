/*! Feel · rotary knob · MIT
 *
 * A knob whose angle is a body with mass, in degrees. Each detent is a magnet
 * (the click), the ends of the sweep are walls, and a drag turns the pointer's
 * angle around the knob's centre into the hand. A heavy knob keeps turning
 * after a flick and clicks into whichever detent catches it.
 *
 *   const k = Feel.rotaryKnob(el, { feel: "heavy, clicky", detents: 11, range: [-135, 135], value: 5, onChange })
 *   k.css(true)   // let the browser play each release (Feel.handoff)
 *
 * Markup: <div class="fk-knob" aria-label="…"><span class="fk-ring"></span><span class="fk-cap"><i class="fk-mark"></i></span></div>
 * The component makes it a slider, adds one <i class="fk-tick" style="--a: …deg">
 * per detent, and sets --fk-level (0 → 1 across the sweep) on the knob.
 * Register it to glide in CSS mode:
 *   @property --fk-level { syntax: "<number>"; inherits: true; initial-value: 0; }
 */
(function (global) {
  "use strict";
  const Feel = global.Feel;

  function rotaryKnob(el, o = {}) {
    const [lo, hi] = o.range || [-135, 135];
    const n = o.detents ?? 11;
    const stops = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
    const w = Feel.words(o.feel || "heavy, clicky");
    const strength = w.magnet || 0.6;
    // The click reaches a third of the way to the next detent.
    const field = Feel.magnets({ stops, reachFreq: 0.6 + 0.5 * strength, clickFreq: 3 + 4 * strength, clickRadius: o.clickRadius ?? (hi - lo) / (n - 1) / 3 });
    const cap = el.querySelector(".fk-cap");
    let index = Math.max(0, Math.min(n - 1, o.value ?? Math.floor(n / 2)));

    const body = new Feel.Body({
      ...w.params,
      unit: "°",
      x: stops[index],
      target: null,
      forces: [field, ...(w.friction ? [Feel.friction({ level: 700 * w.friction })] : [])],
      min: lo, max: hi,
      name: "knob",
      onFrame: (b) => Feel.paint(styles(b)),
      onSettle: (b) => { const i = stops.indexOf(field.rest(b.x)); if (i !== index) { index = i; aria(); o.onChange && o.onChange(i, stops[i]); } },
    });

    function styles(b) {
      return [
        [cap, { transform: `rotate(${b.x.toFixed(2)}deg)` }],
        [el, { "--fk-level": Math.max(0, Math.min(1, (b.x - lo) / (hi - lo))).toFixed(4) }],
      ];
    }
    function aria() {
      el.setAttribute("aria-valuenow", String(index));
      el.setAttribute("aria-valuetext", `${index + 1} of ${n}`);
    }

    for (const a of stops) { const t = document.createElement("i"); t.className = "fk-tick"; t.style.setProperty("--a", `${a}deg`); el.appendChild(t); }
    el.setAttribute("role", "slider");
    el.tabIndex = 0;
    el.setAttribute("aria-valuemin", "0");
    el.setAttribute("aria-valuemax", String(n - 1));
    aria();

    // The detent it's heading for right now (sampled, in case the browser is playing it).
    const here = () => stops.indexOf(field.rest(body.sample().x));
    const go = (i) => body.kickTo(stops[Math.max(0, Math.min(n - 1, i))]);
    Feel.drag(el, body, { axis: "angle" });
    el.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (d) { e.preventDefault(); go(here() + d); }
      else if (e.key === "Home") { e.preventDefault(); go(0); }
      else if (e.key === "End") { e.preventDefault(); go(n - 1); }
    });
    Feel.paint(styles(body));

    let css = null;
    return {
      body, field, stops, go,
      get value() { return index; },
      step: (d) => go(here() + d),
      css(on) {
        if (on && !css) {
          css = Feel.handoff(body, styles, {
            // rotate() reads back as a matrix, which only knows the angle mod 360; unwrap it near the body's angle.
            read: () => { const m = new DOMMatrixReadOnly(getComputedStyle(cap).transform), a = (Math.atan2(m.b, m.a) * 180) / Math.PI; return a + 360 * Math.round((body.x - a) / 360); },
          });
        } else if (!on && css) { css.off(); css = null; }
      },
    };
  }

  Feel.rotaryKnob = rotaryKnob;
})(typeof window !== "undefined" ? window : globalThis);
