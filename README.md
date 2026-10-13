# Feel

**Interactions built on physics. No hand-picked durations.** A skill for Claude Code, plus the runtime and test rig it uses.

Say how it should feel, for example "a toggle that feels heavy", "a drawer with a magnetic snap" or "a card you throw into a corner". You get two things:

- **A production component** driven by mass, stiffness, damping and force fields, on a line, in a plane or around a dial.
- **A test rig** that plots position, velocity and the force field. It overlays the model's prediction on the measured motion, can hand each release to the browser as CSS keyframes baked from the same model, and exports the same spring to Framer Motion, react-spring, SwiftUI, Compose or CSS `linear()`.

## The rule

**Every motion comes from a physical model. No hand-picked durations.**

- A tap changes a target or gives an impulse.
- A drag pulls the body through a hand spring, so heavy things lag the finger.
- Release keeps the body's real velocity, and decisions come from where it would coast.
- If CSS forces a duration, it's computed from the model and labelled as such.
- `scripts/audit.mjs` fails on any `transition: 300ms`, `cubic-bezier`, `duration:` or timer that moves things.

## Try it

```bash
python3 -m http.server 8750
open http://127.0.0.1:8750/
```

**Heavy toggle:** drag it slowly, flick it, or let go halfway. **Magnetic drawer:** flick the sheet and watch which magnet catches it. **Corner card:** throw it diagonally. **Knob:** turn it, flick it, and feel the detents. Switch any rig's "Runs on" to CSS keyframes and the browser plays each release instead.

## Install the skill

```bash
npx skills add diip3sh/feel
# or
git clone https://github.com/diip3sh/feel ~/.claude/skills/feel
```

```
/feel a toggle that feels heavy, React
/feel bottom sheet with three magnetic stops, slightly bouncy
```

## Runtime

```js
const body = new Feel.Body({ feel: "heavy", x: 0, target: 0, min: 0, max: 60, onFrame: (b) => thumb.style.transform = `translateX(${b.x}px)` });
Feel.drag(el, body, { axis: "x", onTap: () => body.to(body.target ? 0 : 60) });
body.onRelease = (b, projected) => b.to(projected > 30 ? 60 : 0);
```

`Feel.words("very heavy, snappy")`, `Feel.metrics(params)`, `Feel.magnets({ stops, period })`, `Feel.Body2D` with `Feel.points({ stops })`, `Feel.drag(el, body, { axis: "x" | "y" | "xy" | "angle" })`, `Feel.handoff(body, styles)`, `Feel.exportCode(params, "framer")`, `Feel.rig(host, { body, stage, travel })`. React: `runtime/react/useFeel.ts`.

The rig's controls (`Feel.ui`) follow [Fluid Functionalism](https://www.fluidfunctionalism.com/), ported to plain DOM and moved by Feel springs.

## Audit

```bash
node scripts/audit.mjs            # components + demo
node scripts/audit.mjs src/ --feel "heavy, snappy"
```

It scans for hand-picked durations, checks the solver against the exact solution on a line and in a plane, checks passivity and settling, checks that taps land on every stop, corner, detent and across a wheel's seam, checks that baked CSS keyframes match the JS loop, and checks that the rig's Measures and its readout give the same settle time.

MIT © diip3sh
