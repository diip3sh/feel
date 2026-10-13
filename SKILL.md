---
name: feel
description: Build UI interactions whose motion comes from a physical model instead of durations and easing curves. Turn a feel described in words ("a toggle that feels heavy", "a drawer with a magnetic snap", "a bouncy card", "a sticky slider") into a production component driven by mass, stiffness, damping and force fields (magnets, friction, walls), plus a test rig that plots position, velocity and the force field, overlays the model's prediction on the measured motion, and exports the same spring to Framer Motion, react-spring, SwiftUI, Compose or CSS linear(). Use this whenever someone asks for an animation, transition, spring, gesture, drag, flick, snap points, bottom sheet, toggle, slider, carousel or any micro-interaction that should "feel" a certain way, or wants to tune or explain a spring, even if they never say "physics".
---

# Feel

This skill makes interactions that move like things. A toggle's thumb is a body with mass on a spring. A drawer is a body coasting through a field of magnets. A drag is a force: the pointer pulls the body through a hand spring, so a heavy thing lags the finger and a light thing doesn't. Nothing in the result has a duration or an easing curve. How long a motion takes is a consequence of the model, and the rig can show you exactly why.

One complete page ships with the skill: `index.html`, which has a heavy toggle and a magnetic drawer, each in its rig. Open it before you start. Serve the folder (`python3 -m http.server`) and play with both.

## The one rule

**Every motion comes from a physical model: mass, stiffness, damping and forces. No hand-picked durations.**

That means:

- No `transition: … 300ms`, no `animation-duration`, no `cubic-bezier`, no `ease-out`, no `duration:` options, no timers that move things. `scripts/audit.mjs` fails on any of them.
- A tap is a target change (springs) or an impulse (fields), never a timed slide.
- A drag sets a hand, not a position. Release keeps the body's real velocity.
- A decision on release (which side, which stop) is made from where the body would coast, `x + v·m/c`, or by simulating forward. It is never made from a threshold in milliseconds.
- If a library forces a duration (CSS), the duration is computed from the model, and the code comment says so.

It fails in two ways:

- **Tween in disguise.** The code uses a spring but snaps the target on a timer, or reads pointer velocity and throws it away on release. The motion looks springy and feels dead.
- **Untuned physics.** It's a real spring, but the numbers were typed until it "looked fine". Physics with arbitrary numbers is just a fancier easing curve. Start from words, check them against the rig, and write down why each number is what it is.

## Workflow

1. **Size it, before anything else.** Tell the user which size this is.
   - **Interaction**: one component, one body (toggle, button press, card lift, slider thumb). 20–45 minutes. Build it without asking.
   - **Gesture system**: several bodies or a field (bottom sheet with stops, carousel with momentum, reorderable list). 1–3 hours. Say so, then build it.
   - **Motion system**: a whole product's motion vocabulary (tokens, every component, docs). Half a day or more. Don't start it. Propose the 3 interactions that matter most, and list what the full system would add.
2. **Words to physics.** Write the feel as words and run `Feel.words("…")`. It returns mass, natural frequency and damping ratio, then stiffness and damping. `references/vocabulary.md` has every word and how words blend. If the user's word isn't there, map it to the nearest ones and say which you used. Then write one sentence per number:
   - *frequency 1.35 Hz:* slow enough to read as weight;
   - *ζ 0.74:* a 3% overshoot, the thump of something landing;
   - *mass 3:* lags a fast drag by a few px and coasts 80 px per 1000 px/s.
3. **Choose the model.** `references/models.md` covers them:
   - **Spring to a target** for anything with two or more discrete states chosen by the code (toggle, press, expand).
   - **A field** (magnets, friction, walls) for anything the user throws (sheets, carousels, pickers). A field has no target: the body ends up wherever the field holds it.
   - **Walls** at the ends of travel, for rubber-banding. Overshoot past a physical end is caught by the wall, not drawn through it.
4. **Build the component on a `Feel.Body`.**
   - Drive the DOM only from `onFrame(body)`: transform from `x`, anything else (fill, shadow, stretch) from `x` or `v`.
   - Bind input with `Feel.drag`.
   - Keyboard reaches every state.
   - `prefers-reduced-motion` jumps to rest. The runtime does this for you.
   - Framework-free: copy `components/heavy-toggle.js`. React: `runtime/react/useFeel.ts`.
5. **Put it in the rig.** `Feel.rig(host, { body, stage, travel, stops, feel, actions })`. Check every one of these:
   - **Measured on predicted:** the orange line sits on the dashed prediction after "let go".
   - **The force plot reads as the idea:** one slope for a spring, a well per stop for magnets.
   - **The readout numbers match your sentences from step 2.**
6. **Export if the target stack needs it.** The rig's export tabs give the same spring for Framer Motion, react-spring and SwiftUI (identical equation), Compose (unit-mass stiffness), and CSS `linear()`, which is sampled from the exact solution and only replays a step.
   - **A field exports to Framer Motion's drag inertia** as an approximation, labelled as one.
   - **Everything else has no equivalent.** Say so and ship `runtime/feel.js` (8 kB gzipped, comments included).
7. **Verify.** Run `node scripts/audit.mjs <your files> --feel "<your words>"`. It must print `passed`. Then do it with your hands in the browser:
   - a slow drag, a hard flick, a flick the wrong way, and letting go at exactly halfway;
   - grabbing it mid-motion (it must not jump);
   - keyboard only;
   - reduced motion.

   Record what you saw in one line each. `references/verify.md` has the checklist.

## The runtime

```js
const body = new Feel.Body({ feel: "heavy", x: 0, target: 0, min: 0, max: 60, onFrame, onRelease });
body.to(60);           // new target: the spring takes it there
body.kick(900);        // an impulse, px/s
body.kickTo(170);      // the push that comes to rest at 170 (solved by simulation in a field)
body.grab(px); body.move(px); body.release();   // what Feel.drag calls for you
body.projected();      // where it would coast: x + v·m/c
body.predict(v);       // where it would come to rest from here with velocity v
body.path(x, v);       // the whole predicted path, for the rig's ghost

Feel.words("very heavy, snappy")  // → { params: { mass, stiffness, damping }, modal, magnet, friction }
Feel.metrics(params)              // → { freq, zeta, overshoot, settle, rise, peakVelocity }
Feel.magnets({ stops, reachFreq, clickFreq, clickRadius }); Feel.friction({ level }); Feel.gravity(g)
Feel.exportCode(params, "framer" | "react-spring" | "swiftui" | "compose" | "css", body?)
```

Units are px and seconds. Mass 1 is a normal UI element, and the hand spring is tuned for it. All bodies share one `requestAnimationFrame` loop that stops when everything has settled.

## Craft rules

- **Name the model in one sentence before writing code.** For example: "The thumb is a 3-unit mass on a 1.35 Hz spring with ζ 0.74; the track walls catch the overshoot."
- **Mass is felt in interaction, frequency and damping in motion.** Two toggles with the same frequency and damping but different mass look identical when tapped and feel different when dragged. If the feel is about weight, the demo must include a drag.
- **Everything visual derives from state, not time.** Fill from position, stretch from speed, shadow from height.
- **Overshoot belongs to the thing, not the frame.** If the track ends, a wall catches the thumb. Never let a spring draw a thumb outside its track.
- **Interruptible by construction.** A grab mid-motion takes over from the current x and v. Never reset velocity on grab, and never queue animations.
- **One accent in the rig** (orange). The component's own colours are untouched.

## Limits (v0.1)

- One-dimensional bodies only. For 2D, use two bodies (x and y) and coupling forces. There are no rotation or 2D springs yet.
- CSS export replays a step from rest. It can't carry a flick's velocity or take part in a field.
- The Framer Motion export for fields is an approximation (inertia plus a snap spring), not the same force law.
- The drag model reads pointer events at their own rate. On very low frame rates the hand velocity estimate gets noisy, and the 60 ms rule zeroes stale velocity at release.

## Files

| File | Use it for |
|---|---|
| `runtime/feel.js` | Bodies, the exact spring solution, metrics, words, force fields, drag, the shared loop, export. Works in the browser and in Node. |
| `runtime/rig.js` + `runtime/feel.css` | The test rig: bench, position/velocity/force plots with the predicted ghost, dials, word chips, readout, export tabs. |
| `runtime/react/useFeel.ts` | React hook: a body that writes styles through a ref, without re-rendering. |
| `components/heavy-toggle.js` | Example: a spring with walls, a drag through the hand spring, a flick decided by projection. |
| `components/magnetic-drawer.js` | Example: a field with no target, taps as impulses solved by simulation. |
| `scripts/audit.mjs` | No-durations scan, solver vs exact solution, passivity, settling, taps land. |
| `references/vocabulary.md` | Every feel word, its numbers, and how words blend. |
| `references/models.md` | Springs, fields, walls, the hand, projection, and how to write a new force. |
| `references/verify.md` | The hands-on checklist. |
