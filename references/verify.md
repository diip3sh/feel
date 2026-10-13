# Verify

## The audit

```
node scripts/audit.mjs components/my-thing.js styles/my-thing.css --feel "heavy, snappy"
```

It must print `passed`. It checks:

- **No hand-picked durations:** CSS transition or animation durations, easing curves, `duration:` options, `element.animate` with a duration, timers that move things, and tween libraries. A computed CSS duration is allowed only with a comment saying where it came from. Mark a non-motion colour fade with `/* chrome */` if you keep one.
- **The solver:** stepped at 60 fps, it stays within 0.05 px of the exact solution.
- **Passivity:** energy never grows while nobody touches the body.
- **Settling:** every body rests within 4 s, with no NaN.
- **Taps land:** in a magnet field, `kickTo` lands on every stop from every other stop.
- **The plane:** a `Body2D` thrown sideways off its target follows the exact solution on each axis.
- **Taps land in a plane, on a dial and on a wheel:** every corner from every corner, every detent one step either way, and steps across a wheel's seam at 360°.
- **Bakes:** the keyframes `Feel.handoff` plays stay within their tolerance of the path, end exactly at rest, and the path matches the JS loop's steps.

## With your hands

Do each of these in the rig and write one line about what you saw.

1. **Tap** (or keyboard). It moves, overshoots by about the readout's percentage, and settles in about the readout's time.
2. **Slow drag.** The body follows the finger. A heavy one lags by a few px, and a light one sits under the finger.
3. **Hard flick.** It travels by momentum. A toggle switches even from a short throw. A drawer passes the nearest stop if the flick beats "flick to escape".
4. **Flick the wrong way.** A small backwards flick from the far side brings it back. Nothing is decided by where the finger was.
5. **Let go exactly halfway, without moving.** The spring picks a side from projection (velocity 0, so position decides), and it doesn't stall.
6. **Grab mid-motion.** There's no jump. The body continues from where it is, at the speed it has.
7. **Drag past the end.** It rubber-bands about a third of the way, then springs back on release.
8. **Measured on predicted.** After "let go", the orange line sits on the dashed prediction. If they differ, something outside the model is moving the element (a CSS transition, a layout change, a second writer).
9. **Keyboard only.** Every state can be reached, and the motion is the same physics.
10. **Reduced motion.** Released bodies jump to rest. Dragging still tracks.
11. **In a plane, throw it diagonally.** It goes to the corner the throw points at, and the path sits on the dashed path. A short throw stays in its corner.
12. **On a dial, turn it past the end.** The wall catches it. A flick passes as many detents as its momentum carries, then clicks into one.
13. **CSS keyframes.** Switch the rig's "Runs on" to CSS keyframes and repeat 3, 6 and 8. The motion is the same, a grab mid-flight doesn't jump, and the measured line (read back from the element) still sits on the prediction.
14. **The words still describe it.** Read the readout aloud: does "m 3 · 1.35 Hz · ζ 0.74" match "heavy"? If you had to move a dial far from the word's numbers, change the words, not just the dial, and say why.
