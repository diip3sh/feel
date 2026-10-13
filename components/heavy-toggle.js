/*! Feel · heavy toggle · MIT
 *
 * A switch whose thumb is a body with mass on a spring. Drag it and it lags
 * your finger by its weight; flick it and it decides by where it would coast;
 * let go halfway and the spring takes it the rest of the way. The track's fill
 * and the thumb's stretch are read from position and velocity, never from time.
 *
 *   const t = Feel.heavyToggle(buttonEl, { feel: "heavy", checked: false, onChange })
 *   t.css(true)   // let the browser play each release (Feel.handoff)
 *
 * Markup: <button class="ft-switch" role="switch" aria-checked="false"><span class="ft-thumb"></span></button>
 * For the fill to glide in CSS mode, register it: @property --ft-fill { syntax: "<number>"; inherits: true; initial-value: 0; }
 */
(function (global) {
  "use strict";
  const Feel = global.Feel;

  function heavyToggle(el, o = {}) {
    const thumb = el.querySelector(".ft-thumb");
    const cs = getComputedStyle(el);
    const inset = parseFloat(cs.paddingLeft) || 0;
    const travel = el.clientWidth - thumb.offsetWidth - inset * 2;
    let checked = !!o.checked;

    const body = new Feel.Body({
      feel: o.feel || "heavy",
      x: checked ? travel : 0,
      target: checked ? travel : 0,
      min: 0,
      max: travel,
      name: "thumb",
      onFrame: (b) => Feel.paint(styles(b)),
      // A flick decides by where the thumb would coast on its own momentum.
      onRelease: (b, projected) => set(projected > travel / 2),
    });

    function set(on) {
      if (on !== checked) { checked = on; el.setAttribute("aria-checked", String(on)); o.onChange && o.onChange(on); }
      body.to(on ? travel : 0);
    }

    function styles(b) {
      const f = Math.max(0, Math.min(1, b.x / travel));
      // Stretch along the motion, from speed: a heavy thumb barely deforms.
      const stretch = 1 + Math.min(0.22, Math.abs(b.v) / (2600 * Math.sqrt(b.mass)));
      return [
        [thumb, { transform: `translateX(${b.x.toFixed(2)}px) scale(${stretch.toFixed(3)}, ${(1 / Math.sqrt(stretch)).toFixed(3)})` }],
        [el, { "--ft-fill": f.toFixed(4) }],
      ];
    }

    Feel.drag(el, body, { axis: "x", onTap: () => set(!checked) });
    el.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); set(!checked); }
      else if (e.key === "ArrowRight") { e.preventDefault(); set(true); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); set(false); }
    });
    el.setAttribute("aria-checked", String(checked));
    Feel.paint(styles(body));

    let css = null;
    return {
      body, travel,
      get checked() { return checked; },
      set,
      toggle: () => set(!checked),
      // Throw it: the same decision a real flick makes.
      flick: (vel) => { body.kick(vel); set(body.projected() > travel / 2); },
      css(on) {
        if (on && !css) css = Feel.handoff(body, styles, { read: () => new DOMMatrixReadOnly(getComputedStyle(thumb).transform).m41 });
        else if (!on && css) { css.off(); css = null; }
      },
    };
  }

  Feel.heavyToggle = heavyToggle;
})(typeof window !== "undefined" ? window : globalThis);
