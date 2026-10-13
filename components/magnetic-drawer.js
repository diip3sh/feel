/*! Feel · magnetic drawer · MIT
 *
 * A sheet with no target at all. It lives in a force field: each stop is a
 * magnet with a long, weak reach and a strong pull close in (the click).
 * Between stops it coasts on its own momentum and friction, and whichever
 * magnet it ends up near catches it. Past the ends a wall pushes back, which
 * is what rubber-banding is. Tapping the handle gives the sheet exactly the
 * push that coasts it to the next stop.
 *
 *   const d = Feel.magneticDrawer(sheetEl, { stops: [0, 170, 330], feel: "magnetic", scrim, onStop })
 *   d.css(true)   // let the browser play each release (Feel.handoff)
 *
 * `stops` are translateY offsets, smallest = most open. The drag handle is any
 * element inside the sheet with [data-handle] (or the sheet itself). The sheet
 * gets --fd-open (0 closed → 1 open); so does `scrim`, if given, for a dimmer
 * behind it. Register it to glide in CSS mode:
 *   @property --fd-open { syntax: "<number>"; inherits: true; initial-value: 0; }
 */
(function (global) {
  "use strict";
  const Feel = global.Feel;

  function magneticDrawer(sheet, o = {}) {
    const stops = (o.stops || [0, 170, 330]).slice().sort((a, b) => a - b);
    const w = Feel.words(o.feel || "magnetic");
    const strength = w.magnet || 0.6;
    const field = Feel.magnets({ stops, reachFreq: 0.6 + 0.5 * strength, clickFreq: 3 + 4 * strength, clickRadius: o.clickRadius ?? 22 });
    const start = o.start ?? stops[stops.length - 1];
    let at = start;

    const body = new Feel.Body({
      ...w.params,
      x: start,
      target: null,
      forces: [field, ...(w.friction ? [Feel.friction({ level: 700 * w.friction })] : [])],
      min: stops[0],
      max: stops[stops.length - 1],
      name: "sheet",
      onFrame: (b) => Feel.paint(styles(b)),
      onSettle: (b) => { const s = field.rest(b.x); if (s !== at) { at = s; o.onStop && o.onStop(s, stops.indexOf(s)); } },
    });

    function styles(b) {
      const open = (1 - (b.x - stops[0]) / (stops[stops.length - 1] - stops[0])).toFixed(4);
      return [
        [sheet, { transform: `translateY(${b.x.toFixed(2)}px)`, "--fd-open": open }],
        ...(o.scrim ? [[o.scrim, { "--fd-open": open }]] : []),
      ];
    }

    const handle = sheet.querySelector("[data-handle]") || sheet;
    Feel.drag(handle, body, { axis: "y", onTap: () => next() });
    handle.tabIndex = 0;
    handle.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") { e.preventDefault(); go(Math.max(0, here() - 1)); }
      else if (e.key === "ArrowDown") { e.preventDefault(); go(Math.min(stops.length - 1, here() + 1)); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); next(); }
    });

    // The stop the sheet is heading for right now (sampled, in case the browser is playing it).
    const here = () => stops.indexOf(field.rest(body.sample().x));
    // A tap is a push, never a teleport or a timed slide.
    function go(i) { body.kickTo(stops[i]); }
    function next() { const i = here(); go(i === 0 ? stops.length - 1 : i - 1); }

    Feel.paint(styles(body));
    let css = null;
    return {
      body, field, stops, go, next,
      get stop() { return at; },
      css(on) {
        if (on && !css) css = Feel.handoff(body, styles, { read: () => new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42 });
        else if (!on && css) { css.off(); css = null; }
      },
    };
  }

  Feel.magneticDrawer = magneticDrawer;
})(typeof window !== "undefined" ? window : globalThis);
