#!/usr/bin/env node
// Feel audit. No browser, no dependencies.
//
//   node scripts/audit.mjs [files…] [--feel "heavy, snappy"]
//
// 1. No hand-picked durations. Every motion file is scanned for the things that
//    smuggle time in: CSS transition/animation durations, easing curves,
//    setTimeout/setInterval driving motion, Web Animations `duration`, and
//    library tweens. A computed duration (CSS linear() export) is allowed only
//    with the comment that says where it came from.
// 2. The solver is right. For every word in the vocabulary (or the ones you
//    pass), the RK4 body is stepped at 60 fps and compared with the exact
//    solution: max error under 0.05 px over a 100 px step.
// 3. The motion is passive. With nobody touching it, energy never grows.
// 4. It settles. Every body comes to rest within 4 s, with no NaN.
// 5. Taps land. In a magnet field, kickTo(stop) rests at that stop, from every
//    stop to every other.
// 6. The plane is right. A Body2D is an isotropic spring, so each axis must
//    follow the exact 1D solution on its own, even when it's thrown sideways.
// 7. Taps land in a plane, on a dial and on a wheel: corners from every corner,
//    detents one step either way, and stops across the wrap at 360°.
// 8. Bakes are faithful. The keyframes Feel.handoff gives the browser stay
//    within their tolerance of the path, end exactly at rest, and the path is
//    the one the JS loop would have stepped.
// Exits 1 on any failure.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
await import(resolve(here, "../runtime/feel.js"));
const Feel = globalThis.Feel;

const args = process.argv.slice(2);
const feelIdx = args.indexOf("--feel");
const feelText = feelIdx >= 0 ? args[feelIdx + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && !(feelIdx >= 0 && i === feelIdx + 1));
const targets = files.length ? files : [resolve(here, "../components"), resolve(here, "../index.html")];

let failures = 0;
const fail = (msg) => { failures++; console.log("  ✗ " + msg); };
const pass = (msg) => console.log("  ✓ " + msg);

// ───────────────────────────────────────────── 1. durations
console.log("\n1 · no hand-picked durations");
const RULES = [
  [/transition\s*:[^;{}]*\b\d+(\.\d+)?m?s\b/i, "CSS transition with a duration"],
  [/transition-duration\s*:/i, "CSS transition-duration"],
  [/animation(-duration)?\s*:[^;{}]*\b\d+(\.\d+)?m?s\b/i, "CSS animation with a duration"],
  [/cubic-bezier\(|\bease-(in|out|in-out)\b/i, "an easing curve"],
  [/\bduration\s*:\s*\d/i, "a duration option (Web Animations / tween)"],
  [/\.animate\(\s*[^)]*\{[^}]*duration/i, "element.animate with a duration"],
  [/set(Timeout|Interval)\(.*(\.style|transform|translate|\.left|\.top|opacity)/i, "a timer that moves something"],
  [/\b(gsap|anime|tween)\.(to|from|timeline)\(/i, "a tween library"],
];
const ALLOW = /computed from|settle time of|not a choice/i;
function walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) return readdirSync(p).flatMap((f) => (f === "node_modules" || f.startsWith(".") ? [] : walk(join(p, f))));
  return [".js", ".mjs", ".ts", ".tsx", ".jsx", ".css", ".html", ".vue", ".svelte"].includes(extname(p)) ? [p] : [];
}
for (const file of targets.flatMap((t) => walk(resolve(t)))) {
  const lines = readFileSync(file, "utf8").split("\n");
  let hits = 0;
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) && !/transition|animation/.test(line.replace(/\/\/.*$/, ""))) return;
    for (const [re, what] of RULES) {
      if (re.test(line) && !ALLOW.test(line) && !ALLOW.test(lines[i + 1] || "")) {
        // UI chrome (colour fades on hover) is not motion; mark it with /* chrome */ to allow it.
        if (/\/\*\s*chrome\s*\*\//.test(line)) continue;
        hits++; fail(`${file.replace(process.cwd() + "/", "")}:${i + 1} ${what}: ${line.trim().slice(0, 90)}`);
      }
    }
  });
  if (!hits) pass(`${file.replace(process.cwd() + "/", "")}`);
}

// ───────────────────────────────────────────── 2–4. physics
const vocab = feelText ? [feelText] : Object.keys(Feel.WORDS).filter((w) => Feel.WORDS[w].freq || Feel.WORDS[w].mass);
console.log(`\n2–4 · solver, passivity and settling for ${vocab.length} feel${vocab.length > 1 ? "s" : ""}`);
for (const w of vocab) {
  const p = Feel.words(w).params;
  const body = new Feel.Body({ ...p, x: 0, target: 100 });
  const exact = Feel.response(p, -100, 0);
  let maxErr = 0, grew = 0, prevE = body.energy(), t = 0, nan = false;
  while (t < 4) {
    body.step(1 / 60); t += 1 / 60;
    const [u] = exact(t);
    maxErr = Math.max(maxErr, Math.abs(body.x - 100 - u));
    const E = body.energy();
    if (E > prevE * (1 + 1e-9) + 1e-9) grew++;
    prevE = E;
    if (!Number.isFinite(body.x)) { nan = true; break; }
    if (body.settled()) break;
  }
  const d = Feel.describe(p);
  const ok = maxErr < 0.05 && !grew && !nan && t < 4;
  const line = `${w.padEnd(12)} m ${d.mass} k ${d.stiffness} c ${d.damping} · ζ ${d.zeta} · ${d.freq} Hz · err ${maxErr.toExponential(1)} px · settled ${Math.round(t * 1000)} ms`;
  if (ok) pass(line); else fail(`${line}${grew ? ` · energy grew ${grew}×` : ""}${nan ? " · NaN" : ""}${t >= 4 ? " · never settled" : ""}`);
}

// ───────────────────────────────────────────── 5. magnets
console.log("\n5 · taps land in a magnet field");
for (const w of ["magnetic", "heavy magnetic", "light magnetic", "sticky magnetic"]) {
  const words = Feel.words(w);
  const stops = [0, 170, 330];
  const field = Feel.magnets({ stops, reachFreq: 0.6 + 0.5 * (words.magnet || 0.6), clickFreq: 3 + 4 * (words.magnet || 0.6), clickRadius: 22 });
  const forces = [field, ...(words.friction ? [Feel.friction({ level: 700 * words.friction })] : [])];
  let bad = 0;
  for (const from of stops) for (const to of stops) {
    if (from === to) continue;
    const b = new Feel.Body({ ...words.params, x: from, target: null, forces, min: 0, max: 330 });
    b.kickTo(to);
    let t = 0;
    while (t < 6 && !b.settled()) { b.step(1 / 60); t += 1 / 60; }
    if (b.rest() !== to || !b.settled()) { bad++; fail(`${w}: ${from} → ${to} rested at ${b.rest()} (x ${b.x.toFixed(1)})`); }
  }
  if (!bad) pass(`${w}: every tap lands (6 of 6)`);
}

// ───────────────────────────────────────────── 6. the plane
console.log("\n6 · a body in a plane follows the exact solution on each axis");
for (const w of feelText ? [feelText] : ["snappy", "heavy", "airy", "bouncy"]) {
  const p = Feel.words(w).params;
  // Off target on x, thrown sideways on y: two different 1D motions at once.
  const body = new Feel.Body2D({ ...p, x: 0, y: 0, vy: 600, target: { x: 100, y: 0 } });
  const ex = Feel.response(p, -100, 0), ey = Feel.response(p, 0, 600);
  let maxErr = 0, grew = 0, prevE = body.energy(), t = 0, nan = false;
  while (t < 4) {
    body.step(1 / 60); t += 1 / 60;
    maxErr = Math.max(maxErr, Math.hypot(body.x - 100 - ex(t)[0], body.y - ey(t)[0]));
    const E = body.energy();
    if (E > prevE * (1 + 1e-9) + 1e-9) grew++;
    prevE = E;
    if (!Number.isFinite(body.x) || !Number.isFinite(body.y)) { nan = true; break; }
    if (body.settled()) break;
  }
  const line = `${w.padEnd(12)} err ${maxErr.toExponential(1)} px · settled ${Math.round(t * 1000)} ms`;
  if (maxErr < 0.05 && !grew && !nan && t < 4) pass(line); else fail(`${line}${grew ? ` · energy grew ${grew}×` : ""}${nan ? " · NaN" : ""}${t >= 4 ? " · never settled" : ""}`);
}

// ───────────────────────────────────────────── 7. plane, dial, wheel
console.log("\n7 · taps land in a plane, on a dial and on a wheel");
const settle = (b, limit = 6) => { let t = 0; while (t < limit && !b.settled()) { b.step(1 / 60); t += 1 / 60; } return b.settled(); };
for (const w of ["airy, slightly magnetic", "magnetic", "heavy magnetic"]) {
  const words = Feel.words(w), strength = words.magnet || 0.6;
  const W = 204, H = 136;
  const field = Feel.points({ stops: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], reachFreq: 0.6 + 0.5 * strength, clickFreq: 3 + 4 * strength, clickRadius: 28 });
  const forces = [field, ...(words.friction ? [Feel.friction2d({ level: 700 * words.friction })] : [])];
  let bad = 0, n = 0;
  for (const from of field.stops) for (const to of field.stops) {
    if (from === to) continue;
    n++;
    const b = new Feel.Body2D({ ...words.params, x: from.x, y: from.y, target: null, forces, min: { x: 0, y: 0 }, max: { x: W, y: H } });
    b.kickTo(to);
    if (!settle(b) || b.rest() !== to) { bad++; fail(`corners · ${w}: (${from.x}, ${from.y}) → (${to.x}, ${to.y}) rested at (${b.x.toFixed(1)}, ${b.y.toFixed(1)})`); }
  }
  if (!bad) pass(`corners · ${w}: every tap lands (${n} of ${n})`);
}
for (const w of ["heavy, clicky", "clicky", "light, clicky"]) {
  const words = Feel.words(w), strength = words.magnet || 0.6;
  const stops = Array.from({ length: 11 }, (_, i) => -135 + 27 * i);
  const field = Feel.magnets({ stops, reachFreq: 0.6 + 0.5 * strength, clickFreq: 3 + 4 * strength, clickRadius: 9 });
  const forces = [field, ...(words.friction ? [Feel.friction({ level: 700 * words.friction })] : [])];
  let bad = 0, n = 0;
  stops.forEach((from, i) => {
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= stops.length) continue;
      n++;
      const b = new Feel.Body({ ...words.params, unit: "°", x: from, target: null, forces, min: -135, max: 135 });
      b.kickTo(stops[j]);
      if (!settle(b) || b.rest() !== stops[j]) { bad++; fail(`detents · ${w}: ${from}° → ${stops[j]}° rested at ${b.x.toFixed(1)}°`); }
    }
  });
  if (!bad) pass(`detents · ${w}: every step lands (${n} of ${n})`);
}
{
  // A wheel with a stop every 30°: across the seam, 330° → 360° is one step.
  const words = Feel.words("clicky");
  const field = Feel.magnets({ stops: Array.from({ length: 12 }, (_, i) => 30 * i), period: 360, reachFreq: 0.9, clickFreq: 5.4, clickRadius: 10 });
  const moves = [[330, 360], [0, -30], [360, 390], [-30, 0], [150, 180]];
  let bad = 0;
  for (const [from, to] of moves) {
    const b = new Feel.Body({ ...words.params, unit: "°", x: from, target: null, forces: [field] });
    b.kickTo(to);
    if (!settle(b) || b.rest() !== to) { bad++; fail(`wheel: ${from}° → ${to}° rested at ${b.x.toFixed(1)}° (stop ${b.rest()})`); }
  }
  if (!bad) pass(`wheel: steps across the seam land (${moves.length} of ${moves.length})`);
}

// ───────────────────────────────────────────── 8. bakes
console.log("\n8 · baked keyframes match the path the loop would step");
{
  const toggle = Feel.words("heavy").params, drawerW = Feel.words("magnetic"), cardW = Feel.words("airy, slightly magnetic"), knobW = Feel.words("heavy, clicky");
  const cases = [
    ["toggle", () => new Feel.Body({ ...toggle, x: 0, v: 300, target: 64, min: 0, max: 64 })],
    ["drawer", () => new Feel.Body({ ...drawerW.params, x: 330, v: -1400, target: null, min: 0, max: 330, forces: [Feel.magnets({ stops: [0, 170, 330], reachFreq: 1.1, clickFreq: 7, clickRadius: 22 })] })],
    ["card", () => new Feel.Body2D({ ...cardW.params, x: 0, y: 0, vx: 900, vy: 500, target: null, min: { x: 0, y: 0 }, max: { x: 204, y: 136 },
      forces: [Feel.points({ stops: [{ x: 0, y: 0 }, { x: 204, y: 0 }, { x: 204, y: 136 }, { x: 0, y: 136 }], reachFreq: 0.9, clickFreq: 5.4, clickRadius: 28 })] })],
    ["knob", () => new Feel.Body({ ...knobW.params, unit: "°", x: -135, v: 400, target: null, min: -135, max: 135,
      forces: [Feel.magnets({ stops: Array.from({ length: 11 }, (_, i) => -135 + 27 * i), reachFreq: 0.9, clickFreq: 5.4, clickRadius: 9 })] })],
  ];
  const tol = 0.2;
  for (const [name, make] of cases) {
    const body = make(), b = body.bake(tol), keys = b.keys, d = b.dense;
    // Linear between keyframes, as the browser plays them, at every dense sample.
    let worst = 0, k = 0;
    for (const s of d) {
      while (k < keys.length - 2 && keys[k + 1].t < s.t) k++;
      const a = keys[k], c = keys[k + 1] || a, f = c.t > a.t ? (s.t - a.t) / (c.t - a.t) : 0;
      worst = Math.max(worst, body.gap(s, a, c, f));
    }
    // The same body stepped the way the loop does (1/60 s frames) lands on the same samples.
    const live = make();
    let drift = 0;
    for (let i = 4; i < d.length - 1; i += 4) {
      live.step(1 / 60);
      drift = Math.max(drift, body.gap(d[i], live.state(), live.state(), 0));
    }
    const end = keys[keys.length - 1], rest = body.ghost(end).rest();
    const atRest = body.dims === 2 ? rest && end.x === rest.x && end.y === rest.y : end.x === rest;
    const line = `${name.padEnd(7)} ${keys.length} keyframes for ${d.length} samples · ${Math.round(b.duration * 1000)} ms · within ${worst.toFixed(3)} of ${tol} · loop drift ${drift.toExponential(1)}`;
    if (worst <= tol + 1e-9 && drift < 1e-6 && atRest && keys.length < d.length / 4) pass(line);
    else fail(`${line}${atRest ? "" : " · doesn't end at rest"}`);
  }
}

console.log(`\n${failures ? "FAILED" : "passed"} · ${failures} problem${failures === 1 ? "" : "s"}`);
process.exit(failures ? 1 : 0);
