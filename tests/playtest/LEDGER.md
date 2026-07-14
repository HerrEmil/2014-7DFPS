# 2014-7DFPS — Playtest Ledger

A Three.js pointer-lock FPS (static site, `index.html` at repo root, THREE r69).
Headless caveat: pointer lock is ungrantable, so `controls.enabled` stays
`false` and free-look/WASD movement can't be driven headless — but the world
boots (WebGL via SwiftShader), all assets 200, and the mouse-input handlers are
fully exercisable via synthetic `mousedown` events.

---

## 2026-07-14 — first harness + input-gating fix

**Selected this run** as the game with the fewest regression tests / oldest
ledger (it had zero tests and no ledger; Sandpiper was the other zero-test
candidate but is compiled WASM with almost no fixable source surface).

**Harness bootstrapped:** scaffolded `package.json`, `playwright.config.ts`
(webServer serves the repo root on :4507), installed `@playwright/test` +
chromium, added `tests/playtest/`, and gitignored `node_modules/`,
`test-results/`, `playwright-report/`, `.playwright-mcp/`.

**Play coverage this run (seeds 70000–70999):** booted headless; confirmed all
five referenced assets 200 (`three.min.js`, `PointerLockControls.js`,
`7DFPS-2014.js`, `models/platform/platform.json` + `.jpg`, `textures/b7e.jpg`);
only console noise is the benign `favicon.ico` 404 and THREE's own
`PlaneGeometry` info log. Probed game state (camera/held-piece positions,
`triHexMeshes`) for NaN/Infinity — none. Fuzzed left/right `mousedown` in both
the unlocked (not-playing) and forced-locked (playing) states; resize left the
canvas full-viewport (no CLS surface — the renderer canvas is the only content).

**Confirmed defect — mouse input not gated on play state.**
The document `mousedown` handler (`js/7DFPS-2014.js`) fired `shootTriHexMesh()`
(left button) and `rotateTriHexMesh(60)` (right button) **unconditionally**,
ignoring `controls.enabled`. Because the very click that requests pointer lock is
a left `mousedown`, and because any click on the "Click to play" blocker counts,
this meant:
  * the click-to-play itself dumped a piece into the world, and
  * every click while unlocked spawned/detached another mesh with no bound —
    10 unlocked left-clicks grew `triHexMeshes` 1 → 11 (the source even comments
    *"This keeps getting longer, should have max amount of shots"*).
*Root-cause fix:* added the same `if (!controls.enabled) return;` guard that
`PointerLockControls` uses throughout its own mousemove/update handlers, so
weapon input only acts while the game is actually being played.

**Regression test:** `regression-input-gating.spec.ts` — drives synthetic
`mousedown` while unlocked and asserts `triHexMeshes.length` (left) and
`heldMesh.quaternion.w` (right) are unchanged. Proven **FAIL pre-fix**
(count 1 → 13; quaternion.w 1 → −0.866) and **PASS post-fix**. A third
characterization test pins the headless-unlocked start state. Also verified
manually that forcing `controls.enabled = true` restores intended play
(left-click spawns, right-click rotates), so the guard does not over-gate.

**Gate:** `npx playwright test` → 3 passed. No lighthouserc/size/html-validate
config in this repo, so the perf/lint gate is N/A here.

**Known follow-ups (not this run):**
- Right-click has no `contextmenu` preventDefault, so during play a right-click
  (intended to rotate) also pops the browser context menu, which exits pointer
  lock. A `contextmenu` → `preventDefault` (guarded on `controls.enabled`) would
  be the clean follow-up.
- `triHexMeshes` still grows unbounded during legitimate play (one entry per
  shot, never culled) — the source's own TODO. A max-shots cap / recycling of
  off-screen pieces is a deliberate gameplay change worth doing on its own.
- The stale-`prevTime` first-frame delta in `PointerLockControls.update()` (time
  accrues while `enabled` is false, then the first played frame sees a huge
  `delta`) is self-correcting via the floor clamp, but resetting `prevTime` on
  lock-acquire would be tidier.
