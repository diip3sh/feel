# Models

Every body obeys one equation:

```
m·x″ = −k·(x − target) − c·v + Σ forces(x, v) + walls + hand
```

The solver is RK4 at 240 steps per second. Its error against the exact solution is under 1e-4 px over a 100 px step, and `scripts/audit.mjs` checks this for every word.

## Spring to a target

Use it when the code chooses between states: toggles, presses, expand/collapse, tabs.

- **`body.to(x)`** changes the target. The current velocity carries over, so retargeting mid-motion is seamless.
- **Overshoot** is `exp(−ζπ/√(1−ζ²))` for ζ < 1.
- **Settle time** is set by the decay rate: ζ·ω for ζ < 1, ω for ζ = 1, and ω(ζ − √(ζ²−1)) for ζ > 1. That's why over-damped springs feel slow.
- **The exact solution** is `Feel.response(params, x0 − target, v0)`. It powers the CSS export and the audit.

## Walls

`min` and `max` put stiff, well-damped springs at the ends of travel (8 Hz for a unit mass, ζ 0.9 on impact).

- **Overshoot into an end** is caught by the wall. That's the thump of a heavy toggle landing, and it's correct: the thumb can't leave its track.
- **Rubber-banding** comes from the same walls. Dragging past an end pulls against the wall, so the body stretches only part of the way. No resistance curve is needed.

## Fields

A field is a force that depends on position. A body in a field has `target: null` and rests wherever the field holds it.

- **`Feel.magnets({ stops, reachFreq, clickFreq, clickRadius })`**: each stop pulls with a weak, long-range spring (reach) plus a strong spring inside `clickRadius` (the click). Between two stops the far pulls meet in a ridge, so where a flick ends up depends only on momentum. The force plot in the rig shows the wells.
- **`Feel.friction({ level })`**: constant deceleration against motion, smoothed near zero speed. It makes things feel sticky or resistant, and it stops a coast sooner than damping alone.
- **`Feel.gravity(g)`**: a constant force, for things that should fall back to one side.
- **A force of your own** is `(x, v, body) => force`, in px/s² times mass. Give it `.rest(x)` if it has resting points, and `.kind` so the rig and export know what it is. Scale strengths by `body.mass` (as `magnets` does) if the feel should stay the same when mass changes.

## The hand

A drag never sets x. `grab/move/release` attach a hand spring between the pointer and the body. It's tuned at 6 Hz for a unit mass and critically damped relative to the pointer's velocity.

- **A heavy body lags the finger.** A light body tracks it almost perfectly.
- **Release keeps the body's own velocity.** It doesn't use a velocity estimated from the last two pointer events, so there are no fake flicks.
- **A pointer that stopped more than 60 ms before letting go has no velocity left.** This matches what the user's hand actually did.

## Decisions on release

- **Springs:** use `body.projected()` = `x + v·m/c`, which is where damping alone would stop it. A toggle switches if the projection crosses the middle. A heavy thumb coasts further, so a gentle flick is enough.
- **Fields:** the field decides by itself. For taps and keys, `body.kickTo(stop)` finds the impulse that comes to rest at that stop by simulating forward (`body.predict(v)`). It's still one impulse and never a slide.

## Reduced motion

When `prefers-reduced-motion: reduce` is set, a released body jumps straight to where it would have rested: the target, or the stop its projection lands in. Dragging still follows the finger.
