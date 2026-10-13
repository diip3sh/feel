/*! Feel · magnetic drawer · MIT
 *
 * A sheet with no target at all. It lives in a force field: each stop is a
 * magnet with a long, weak reach and a strong pull close in (the click).
 * Between stops it coasts on its own momentum and friction, and whichever
 * magnet it ends up near catches it. Past the ends a wall pushes back, which
 * is what rubber-banding is. Tapping the handle gives the sheet exactly the
 * push that coasts it to the next stop.
 *
 *   const d = Feel.magneticDrawer(sheetEl, { stops: [0, 170, 330], feel: "magnetic", onStop })
 *
 * `stops` are translateY offsets, smallest = most open. The drag handle is any
 * element inside the sheet with [data-handle] (or the sheet itself).
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
      onFrame: render,
      onSettle: (b) => { const s = field.rest(b.x); if (s !== at) { at = s; o.onStop && o.onStop(s, stops.indexOf(s)); } },
    });

    function render(b) {
      sheet.style.transform = `translateY(${b.x.toFixed(2)}px)`;
      const open = 1 - (b.x - stops[0]) / (stops[stops.length - 1] - stops[0]);
      sheet.style.setProperty("--fd-open", open.toFixed(4));
    }

    const handle = sheet.querySelector("[data-handle]") || sheet;
    Feel.drag(handle, body, { axis: "y", onTap: () => next() });
    handle.tabIndex = 0;
    handle.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") { e.preventDefault(); go(Math.max(0, stops.indexOf(field.rest(body.x)) - 1)); }
      else if (e.key === "ArrowDown") { e.preventDefault(); go(Math.min(stops.length - 1, stops.indexOf(field.rest(body.x)) + 1)); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); next(); }
    });

    // A tap is a push, never a teleport or a timed slide.
    function go(i) { body.kickTo(stops[i]); }
    function next() { const i = stops.indexOf(field.rest(body.x)); go(i === 0 ? stops.length - 1 : i - 1); }

    render(body);
    return { body, field, stops, go, next, get stop() { return at; } };
  }

  Feel.magneticDrawer = magneticDrawer;
})(typeof window !== "undefined" ? window : globalThis);
