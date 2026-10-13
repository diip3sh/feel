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

console.log(`\n${failures ? "FAILED" : "passed"} · ${failures} problem${failures === 1 ? "" : "s"}`);
process.exit(failures ? 1 : 0);
