/*! Feel · corner card · MIT
 *
 * A floating card (picture-in-picture) you throw into a corner. It's a body in
 * a plane with no target: each corner is a magnet, and the nearest one is
 * measured in a straight line, so a throw decides by where the card would
 * coast in both directions at once. The edges are walls. Arrow keys and taps
 * give it the one push that coasts it to a corner.
 *
 *   const c = Feel.cornerCard(cardEl, { area: frameEl, feel: "airy, slightly magnetic", inset: 12, onStop })
 *   c.css(true)   // let the browser play each throw (Feel.handoff)
 *
 * The card is absolutely positioned at the area's top-left inset, and the body
 * moves it with translate(). Positions are px from there.
 */
(function (global) {
  "use strict";
  const Feel = global.Feel;

  function cornerCard(card, o = {}) {
    const area = o.area || card.parentElement;
    const inset = o.inset ?? 12;
    const W = area.clientWidth - card.offsetWidth - inset * 2, H = area.clientHeight - card.offsetHeight - inset * 2;
    const w = Feel.words(o.feel || "airy, slightly magnetic");
    const strength = w.magnet || 0.6;
    // Clockwise from the top-left, so a tap walks around the frame.
    const field = Feel.points({ stops: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], reachFreq: 0.6 + 0.5 * strength, clickFreq: 3 + 4 * strength, clickRadius: o.clickRadius ?? 28 });
    const stops = field.stops;
    let at = stops[o.start ?? 2];

    const body = new Feel.Body2D({
      ...w.params,
      x: at.x, y: at.y,
      target: null,
      forces: [field, ...(w.friction ? [Feel.friction2d({ level: 700 * w.friction })] : [])],
      min: { x: 0, y: 0 }, max: { x: W, y: H },
      name: "card",
      onFrame: (b) => Feel.paint(styles(b)),
      onSettle: (b) => { const s = field.rest(b.x, b.y); if (s !== at) { at = s; o.onStop && o.onStop(s, stops.indexOf(s)); } },
    });

    function styles(b) {
      // Lift from speed: the faster it flies, the further it is off the page.
      const lift = Math.min(1, b.speed / 3000);
      return [[card, {
        transform: `translate(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px) scale(${(1 + 0.05 * lift).toFixed(4)})`,
        boxShadow: `0 1px 2px rgba(16, 16, 20, 0.08), 0 ${(4 + 16 * lift).toFixed(1)}px ${(12 + 28 * lift).toFixed(1)}px rgba(16, 16, 20, ${(0.12 + 0.12 * lift).toFixed(3)})`,
      }]];
    }

    // The corner it's heading for right now (sampled, in case the browser is playing it).
    const here = () => { body.sample(); return field.rest(body.x, body.y); };
    function go(i) { body.kickTo(stops[i]); }
    function next() { go((stops.indexOf(here()) + 1) % stops.length); }
    // Throw it toward the opposite corner at `speed` px/s. Where it lands is up to the field.
    function fling(speed) {
      const s = here(), to = stops[(stops.indexOf(s) + 2) % stops.length], d = Math.hypot(to.x - s.x, to.y - s.y);
      body.kick(((to.x - s.x) / d) * speed, ((to.y - s.y) / d) * speed);
    }

    Feel.drag(card, body, { axis: "xy", onTap: next });
    card.tabIndex = 0;
    card.addEventListener("keydown", (e) => {
      const s = here();
      const want = { ArrowLeft: { x: 0, y: s.y }, ArrowRight: { x: W, y: s.y }, ArrowUp: { x: s.x, y: 0 }, ArrowDown: { x: s.x, y: H } }[e.key];
      if (want) { e.preventDefault(); go(stops.findIndex((p) => p.x === want.x && p.y === want.y)); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); next(); }
    });
    Feel.paint(styles(body));

    let css = null;
    return {
      body, field, stops, travel: { x: [0, W], y: [0, H] }, go, next, fling,
      get stop() { return at; },
      css(on) {
        if (on && !css) css = Feel.handoff(body, styles, { read: () => { const m = new DOMMatrixReadOnly(getComputedStyle(card).transform); return { x: m.m41, y: m.m42 }; } });
        else if (!on && css) { css.off(); css = null; }
      },
    };
  }

  Feel.cornerCard = cornerCard;
})(typeof window !== "undefined" ? window : globalThis);
