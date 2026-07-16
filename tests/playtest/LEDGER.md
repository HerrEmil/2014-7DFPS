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

---

## 2026-07-16 — right-click context-menu drops pointer lock (playtest sweep)

**Selected this run** as the game with the fewest regression tests (1 spec /
3 tests — the fewest of the five; GameLand 12, GGJ2015 4, LegendaryJourney 2,
Sandpiper 2). Interactive playtest driven from the main thread via the
Playwright MCP (headless Chromium, SwiftShader WebGL), seed `2026071601`.

**Defect (MEDIUM, confirmed).** Right-click (mouse button 2) is the "rotate the
held piece" control — see the `mousedown` handler in `js/7DFPS-2014.js`. But the
page had **no `contextmenu` listener at all**, so every right-click that rotated
a piece *also* popped the browser's default context menu. That menu steals focus
and exits pointer lock, bouncing the player out of the game on **every single
rotate** — a real, repeating gameplay interruption. Reproduced directly: with
`controls.enabled` forced true (the play state headless can't grant on its own),
a cancelable `contextmenu` event had `defaultPrevented === false`.

*Root-cause fix* (`js/7DFPS-2014.js`): add a document `contextmenu` listener that
calls `event.preventDefault()` **only while `controls.enabled`**, mirroring the
same enabled-gate the `mousedown` handler and all of `PointerLockControls`
already use. So the browser menu is suppressed during play but still works on the
"Click to play" overlay / whenever the game is not locked (the guard cuts both
ways — over-gating would break normal right-click on the blocker screen).

**Regression test:** `regression-contextmenu-pointerlock.spec.ts` — three tests:
1. *right-click while playing suppresses the browser context menu* — forces
   `controls.enabled = true`, dispatches a cancelable `contextmenu`, asserts
   `defaultPrevented === true`. Proven **FAIL pre-fix** (`expected true, received
   false` — verified by `git stash`-ing only the source fix and re-running) and
   **PASS post-fix**.
2. *right-click while NOT playing leaves the browser menu available* — with
   `controls.enabled` false, asserts `defaultPrevented === false` (guard is not
   over-broad). Passes both pre- and post-fix (characterization of the gate).
3. *rotate control still fires on right-click during play* — asserts the held
   piece's `quaternion.w` still changes on a play-state `mousedown` button 2, so
   suppressing the menu didn't disturb the existing rotate handler.

**Play coverage this run (seed `2026071601`):** boot hygiene (only console error
is a `favicon.ico` 404 the browser auto-requests — not referenced by the game);
120-step seeded WASD+jump+shoot+rotate fuzz with `controls.enabled` forced true —
player position, held-piece quaternion all stayed **finite** (no NaN/Infinity),
no softlock; `triHexMeshes` grew 1 → 37 during the shoot fuzz (the documented
unbounded-growth follow-up — a gameplay change, out of scope here); resize to
mobile 375×812 and desktop 1280×800 — `camera.aspect` finite (1.6), no horizontal
overflow, `onWindowResize` clean.

**Gate:** `npx playwright test` → **6 passed** (3 prior input-gating + 3 new
context-menu). No lighthouserc/size/html-validate config in this repo, so the
perf/lint gate is N/A here. `.gitignore` already covers `node_modules/`,
`test-results/`, `playwright-report/`, `.playwright-mcp/`.

**Cross-game recon this run (the other four games, fresh-seed fan-out, all
read-only — LegendaryJourney served from its existing `dist/` with no rebuild and
zero repo writes, since a separate burn task shares that checkout):**
- **GGJ2015** ("Sand Grains", seed `2026071602`): **one NEW MEDIUM** — premise-
  gated story steps re-fire their whole success set (and re-arm `nextScene` +
  ambience audio) on *every* click after completion, because the premise branch
  in `src/scripts/clicks.js:10-12` sets `obj.fulfilled = true` but never *checks*
  it first, unlike the non-premise `else` branch at `clicks.js:17` (3 clicks on an
  unlocked target → 15 bubbles). Plus the known-deferred bubble DOM/memory leak
  (30 → 50 `.bubble` nodes, all `display:none`, none removed) and locked-bubble
  spam-stacking, both still reproduce. Zero console errors/NaN. → strong
  candidate for the next GGJ2015 fix run.
- **GameLand** (screen shell, seed `2026071603`): no new defects. All 13 games
  enter/BACK cleanly, single rAF loop survives spam re-entry (72 ticks/600ms,
  ratio 1.00 — no dual/leaked loops), road-cross resize freeze stays fixed,
  score/best persistence correct (score-0 game-overs write no best). Only the
  known-deferred mobile 1024px shell overflow; the two 404s were intentional
  missing-screen probes.
- **LegendaryJourney** (canvas roguelike, seed `2026071604`): no new defects.
  Realm 1→2 progression, level-up, gear growth, health invariant (`health` never
  exceeds `maxHP`, e.g. 145/145) all verified over ~400 seeded steps + 22 room
  sweeps; no NaN/Infinity, no softlock, no console errors. Known-deferred
  every-keydown `preventDefault` and canvas `alert()` hint confirmed.
- **Sandpiper** (Defold WASM, seed `2026071605`): clean — the engine actually
  reached the render loop headless this run; 11/11 loader assets 200 with exact
  case verified against disk (the real S3 deploy-safety signal), no console
  errors, resize clean (no white band, the prior fix holds).

**Known follow-ups (not this run):**
- `triHexMeshes` still grows unbounded during legitimate play (one entry per
  shot, never culled) — the source's own TODO. A max-shots cap / recycling of
  off-screen pieces is a deliberate gameplay change worth doing on its own.
- The stale-`prevTime` first-frame delta in `PointerLockControls.update()` (time
  accrues while `enabled` is false, then the first played frame sees a huge
  `delta`) is self-correcting via the floor clamp, but resetting `prevTime` on
  lock-acquire would be tidier.
