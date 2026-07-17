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
- ~~The stale-`prevTime` first-frame delta in `PointerLockControls.update()` (time
  accrues while `enabled` is false, then the first played frame sees a huge
  `delta`) is self-correcting via the floor clamp, but resetting `prevTime` on
  lock-acquire would be tidier.~~
  **DISPROVEN 2026-07-17 — DO NOT TRUST THIS BULLET.** It is not self-correcting
  and it is not a tidiness nit: it is a HIGH-severity, softlock-grade teleport
  (player flung ~4300 units into fogged void on any ESC-and-return). The floor
  clamp is **Y-only** (`PointerLockControls.js:172-179`); **X and Z are
  unclamped**, and the damping factor `(1 - 10*delta)` **inverts** for
  `delta > 0.1s`. See the 2026-07-17 entry — leading candidate for the next fix
  run, with a proven one-line fix.

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
- ~~The stale-`prevTime` first-frame delta in `PointerLockControls.update()` (time
  accrues while `enabled` is false, then the first played frame sees a huge
  `delta`) is self-correcting via the floor clamp, but resetting `prevTime` on
  lock-acquire would be tidier.~~
  **DISPROVEN 2026-07-17 — DO NOT TRUST THIS BULLET.** It is not self-correcting
  and it is not a tidiness nit: it is a HIGH-severity, softlock-grade teleport
  (player flung ~4300 units into fogged void on any ESC-and-return). The floor
  clamp is **Y-only** (`PointerLockControls.js:172-179`); **X and Z are
  unclamped**, and the damping factor `(1 - 10*delta)` **inverts** for
  `delta > 0.1s`. See the 2026-07-17 entry — leading candidate for the next fix
  run, with a proven one-line fix.

---

## 2026-07-17 — RECON ONLY (no code fix) — stale-`prevTime` re-classified HIGH

**Not this run's fix target.** Sandpiper won the selection tiebreak (fewest specs
AND oldest ledger entry) and was fixed/gated/pushed instead. This run was recon
only: **no source file was touched**, no spec added, repo left clean on `main`
@ `7d5209a`. All probes ran as throwaway specs from a scratchpad-local Playwright
config (`node_modules` symlinked in, webServer serving the repo root read-only),
so nothing entered the repo tree.

**Seeds this run:** `77010042`, `77011337`, `77012718`, `77013141`, `77014669`
(range 77010000–77019999; prior runs used 70000–70999, `2026071601`, `76063317`).

---

### DEFECT (HIGH, confirmed, observed headlessly) — stale `prevTime` flings the player out of the world. **LEADING CANDIDATE FOR THE NEXT FIX RUN.**

The two prior entries filed this as "self-correcting via the floor clamp" and
"would be tidier". **That verdict is wrong.** This is a softlock-grade teleport
triggered by the single most common pointer-lock interaction there is: press ESC,
come back.

**Why it was missed (don't re-derive the wrong conclusion).** Prior runs only ever
tested the *zero-velocity idle* case — fresh boot, no key ever pressed, idle, then
lock. In that one case the bug genuinely *is* harmless, and the entry generalised
from it. The trap:
* The floor clamp (`PointerLockControls.js:172-179`) clamps **Y only**.
  **X and Z have no clamp at all.**
* With `velocity` at zero, the X/Z terms contribute nothing and the Y blowup *is*
  caught — so the idle case looks clean and "proves" the wrong thing.
* The moment `velocity` is non-zero (i.e. you were *moving* when lock dropped),
  the damping factor `(1 - 10*delta)` goes **negative** for any `delta > 0.1s`,
  so velocity is **inverted and amplified** instead of damped. A 3s pause is a
  **−29×** multiplier.
* Re-verified the control case this run: 5s idle → lock → position unchanged
  `[0,10,0]`. The narrow claim holds; the generalisation does not.

**Root cause.**
* `js/PointerLockControls.js:146` — `this.update()` early-returns when
  `enabled === false`, **before** `prevTime = time` at `:181`. So `prevTime`
  freezes for the whole time the pointer is unlocked, and the first played frame
  computes `delta = (now - prevTime)/1000` = the entire pause duration.
* `js/PointerLockControls.js:151-152` — `velocity.x -= velocity.x * 10.0 * delta`
  (the inverting damping term, above).
* `js/PointerLockControls.js:46` — `onKeyDown` has **no `enabled` gate**, so a
  movement key latches `moveForward = true` while unlocked; then
  `:156` `velocity.z -= 400.0 * delta` applies a full pause-length impulse.
* `js/PointerLockControls.js:170` — `yawObject.translateZ(velocity.z * delta)`
  applies it. Displacement scales roughly with `delta²`.

**Repro A — key already released (most realistic).** Play ~30 frames holding W,
release W, set `controls.enabled = false` (what ESC does), wait 3s, re-enable,
step 2 frames → player at **z = −96.2** becomes **z = +4262.2**: **4358 units in
one frame, sign-flipped** (flung backwards). A normal frame moves **0.336 units**
— a **~13,000×** anomaly. Needs no latched key; the damping inversion alone does it.

**Repro B — latched key.** Hold W on the "Click to play" overlay, wait 3s, then
lock → **z: 0 → −4501.3** in a single frame.

**Causality proof (`delta` is the cause).** Same scenario, varying only the pause:
500ms → **1.9 units**; 5000ms → **425.9 units**. 10× the pause gives 227× the
displacement — the expected superlinear (`delta²`) scaling.

**Consequence — why this is softlock-grade, not cosmetic.** No NaN/Infinity; all
values stay finite. But at `z ≈ 4300` with `THREE.Fog(0xffffff, 0, 750)`
(`7DFPS-2014.js:126`) everything is fogged pure white, and the 200×200 floor plus
all 500 boxes are far out of sight. **There is no landmark to navigate back by**,
and walking back at 400 u/s takes ~11s across a featureless void.

**Proven one-line fix** — `js/PointerLockControls.js:146`:
```js
if ( scope.enabled === false ) { prevTime = performance.now(); return; }
```
Verified this run by serving a patched `PointerLockControls.js` through Playwright
**route interception** (zero repo writes — the technique to reuse):

| scenario | unpatched | patched |
| --- | --- | --- |
| resume after 3s pause | **3909.9** units | **0.559** |
| latched-W first frame | **~4500** units | **0.087** |

Notes for the fixer:
* This is **vendored mrdoob code** — the fix diverges from upstream, so it wants a
  comment saying why (same courtesy the `mousedown`/`contextmenu` guards got).
* `velocity` **intentionally survives the pause** under this fix — momentum
  carries over, which reads as correct. Do not reset it.
* A `delta` clamp (`Math.min(delta, 0.1)`) is the alternative, but advancing
  `prevTime` is the more faithful root-cause fix.

**Regression test design.** Enable → 30 frames of W → disable → wait ≥2s →
re-enable → 2 frames; assert horizontal displacement from the paused position is
`< 5` units (fails at **~3900** pre-fix). Plus a **zero-velocity control case**
(idle, no key, then lock → position unchanged) so the guard is not over-broad —
that case is exactly what previously produced the false clean bill of health.
**Needs a real wall-clock pause, not a seed** — it is deterministic without one.

---

### STILL OPEN (LOW/MEDIUM, confirmed, observed headlessly) — `triHexMeshes` unbounded growth

Real and now **measured**, but still a **gameplay-design change, not a bug fix** —
recommendation unchanged: do the `prevTime` fix first, leave this.

**Root cause.** `js/7DFPS-2014.js:104` pushes every shot into `triHexMeshes` and
never removes it; `shootTriHexMesh()` (`:241`) detaches into `scene` and never
removes it there either (the source's own TODO at `:102` and "Remember to delete
the object later" at `:242`). `updateTriHexPositions()` (`:202`) then walks the
whole array every frame.

**Measured cost** (SwiftShader, so absolute ms is inflated — the **scaling** is
the signal):

| triHexMeshes | scene.children | ms/frame |
| --- | --- | --- |
| 1 | 504 | 14.1 |
| 501 | 1,004 | 27.4 |
| 2,001 | 2,504 | 67.1 |
| 5,001 | 5,504 | 139.3 |

Cleanly linear at **~25µs/mesh/frame**; **frame time doubles at ~500 shots** — a
couple of minutes of ordinary clicking. JS heap stayed **flat at 9.5MB** (geometry
and material are shared), so this is **scene-graph CPU cost, NOT a memory leak**.
All positions finite; pieces drift 1 unit/frame and are never culled.

**Two constraints a fixer must respect:**
1. The source's own note at `:103` — *"if I limit this array, need to put pieces
   attached to enemies elsewhere"*. A cap needs `scene.remove()` on the recycled
   mesh and somewhere for enemy-attached pieces to live.
2. `updateTriHexPositions()` (`:202`) relies on **`triHexMeshes[length-1]` being
   the held piece** (it loops `i < length - 1` to skip it). Any recycling must
   preserve that invariant.

**Regression test would assert:** after N+cap shots, `triHexMeshes.length <=
MAX_SHOTS` and `scene.children.length` stops growing, while the held piece is
still the last element and still rotates.

---

**Play coverage this run (clean / verified):**
- **Assets:** all 6 referenced assets 200 with **exact case verified against a
  case-sensitive disk listing** (`js/three.min.js`, `js/PointerLockControls.js`,
  `js/7DFPS-2014.js`, `textures/b7e.jpg`, `models/platform/platform.json`,
  `models/platform/platform.jpg`) — S3-deploy safe. macOS APFS is
  case-insensitive so the dev server would happily serve a wrong-case path;
  the disk listing is the real signal. `platform.json` carries no embedded
  material/texture refs (`materials: null`) — no hidden asset loads.
- **Boot:** zero console errors, zero page errors, zero unhandled rejections.
  Start state `triHexMeshes = 1`, `controls.enabled = false`, pos `[0,10,0]`,
  `scene.children = 504`.
- **Seeded fuzz (all 5 seeds):** 200 steps each of WASD/arrows/jump/mousemove/
  left+right-click with `controls.enabled` forced true — **no NaN/Infinity** in
  player position, held-piece quaternion, or any triHex mesh; no softlock; no
  console errors. `triHexMeshes` grew 37–49 per run.
- **Resize:** 375×812 → 1280×800 → 375×812. `camera.aspect` finite throughout
  (0.462 / 1.6), canvas tracks the viewport exactly, **no horizontal overflow**,
  `onWindowResize` clean. No CLS surface — the renderer canvas is the only content.
- **Spam-click:** 25 rapid clicks on the "Click to play" overlay spawned nothing
  (`triHexMeshes` stayed 1) — the 2026-07-14 input-gating fix holds.
- **Gate:** `npx playwright test` → **6 passed**, unchanged.

**Not a defect (headless artifact):** spam-clicking raises `WrongDocumentError:
The root document of this element is not valid for pointer lock` from
`document.body.requestPointerLock()` (`7DFPS-2014.js:46`). That is headless
Chromium refusing to grant lock, consistent with the standing caveat.

**Known follow-ups (not this run):**
- **`prevTime` stale-delta — HIGH, do this next.** Full root cause, repros,
  proven one-line fix and regression-test design are in this entry above. This
  supersedes the struck-through "self-correcting / would be tidier" bullets in
  the 2026-07-14 and 2026-07-16 entries.
- `triHexMeshes` unbounded growth — still open, measured in this entry above.
  Gameplay-design change; respects-these-constraints notes included.
- **INFERENCE ONLY — NOT a confirmed defect, do not treat it as one.**
  `document.body.requestPointerLock()` (`7DFPS-2014.js:46`) has no `.catch()`.
  In modern Chrome that call returns a promise that rejects on rapid re-lock
  ("The user has exited the lock before this request was completed"), which would
  surface as an unhandled rejection. **This run could NOT reproduce it
  headlessly** — this Chromium build throws synchronously instead (see the
  headless artifact above). It is **code-reading inference only**; a future run
  would need a real browser with grantable pointer lock to confirm or drop it.

---

## 2026-07-17 (run 2) — FIX RUN — stale-`prevTime` pause teleport FIXED

**This run's fix target** (selection: fewest regression specs of the five games —
2 spec files vs 3-12 elsewhere). The HIGH defect filed by the recon-only entry
above is now **fixed, tested and pushed**.

**Seeds this run:** `77171042`, `77171137`, `77171271`, `77171337`, `77171618`,
`77171808` (range 77171000-77171999; prior runs used 70000-70999, `2026071601`,
`76063317`, 77010000-77019999).

### FIXED (HIGH) — stale `prevTime` flings the player out of the world

Root cause exactly as filed in the entry above; no re-derivation needed.

**Fix** (`js/PointerLockControls.js:146-152`), the one-liner the prior entry
proved, plus a comment recording why it diverges from upstream mrdoob:
```js
if ( scope.enabled === false ) { prevTime = performance.now(); return; }
```
`velocity` deliberately survives the pause — momentum carrying over reads as
correct, and the prior entry's advice not to reset it was followed.

**Independently re-measured before trusting the prior entry.** The regression
test was written FIRST and run against unpatched source; then re-measured after.
A second agent independently reproduced it a different way — route-intercepting
`git show HEAD:js/PointerLockControls.js` — and got the same answer:

| scenario | unpatched | patched |
| --- | --- | --- |
| 2.5s pause, moving player (this run's spec) | **2226-2498** units | **< 1** |
| 2.5s pause, latched key (this run's spec) | **3149** units | **< 1** |
| 3s pause, moving (agent, HEAD route-intercept) | **901.0** units, sign-flipped | **0.50** |
| 3s pause, latched W (agent, HEAD route-intercept) | **4629.6** units | **1.44** |
| idle zero-velocity control | **0** | **0** |

Delta scaling on HEAD re-confirmed superlinear: 500ms pause → 29.06 u,
5000ms → 2155.2 u (**74x** for 10x the pause).

**Regression test:** `tests/playtest/regression-pause-teleport.spec.ts`, 3 tests,
all proven FAIL pre-fix / PASS post-fix (except the control case, which passes on
both **by design** — see below):
1. **moving player, key released** — isolates the damping-inversion term.
2. **key latched during the pause** — isolates the impulse term via `onKeyDown`'s
   missing `enabled` gate (`PointerLockControls.js:46`). A genuinely distinct
   trigger: velocity starts at zero, so the damping term contributes nothing.
3. **idle zero-velocity control** — passes pre-fix on purpose. **This is the trap
   that made two earlier runs file the bug as "self-correcting".** It is in the
   suite to prove the guard is not over-broad, NOT as a bug repro.

Test 1 also asserts the player actually travelled during its 30 forward frames —
without that guard the displacement assertion would pass vacuously if movement
broke outright.

**Gate:** `npx playwright test` → **9/9 passed** (6 pre-existing + 3 new). No
build step, no `.github/workflows`, no `lighthouserc.json`/size/html-validate in
this repo — those gate steps are N/A here.

### NEW — fog colour does not match clear colour (LOW, confirmed)

`js/7DFPS-2014.js:126` sets `scene.fog = new THREE.Fog(0xffffff, 0, 750)` (white)
while `:182` sets `renderer.setClearColor(0x7fdbff)` (light blue). **Statically
verified**; the agent also confirmed it at runtime via a pixel histogram — sky
pixels exactly `[127,219,255]` (110,977 samples) vs fogged-geometry pixels
`[251,251,251]` (17,043 samples). Distant objects therefore do not fade into the
distance; they become **hard white cutouts against a blue sky**. Trivially
reachable — the world is unbounded, so any long run puts geometry at ~750 units.

**Not fixed this run, deliberately:** the one-line fix is to make the two colours
agree, but *which* colour is correct is an art decision (blue fog = distance haze;
white clear = overcast sky), not a defect fix. Worth Emil's taste, not a routine's
guess.

### NEW — the world does not pause while unlocked; shot speed is per-frame (LOW, confirmed)

`updateTriHexPositions()` (`js/7DFPS-2014.js:200-206`) runs unconditionally in
`animate()`. Measured with `controls.enabled === false` (the ESC state): 3 flying
pieces each moved exactly **-61 units over 60 rendered frames** (-1.017 u/frame)
while "paused". Two consequences: shots keep flying while the player sits on the
ESC overlay, and flight speed is **refresh-rate dependent** (144 Hz = 2.4x faster
than 60 Hz). The source already knows — its own comment at `:203` says "Should
take time delta instead of constant". Fixable together with the `triHexMeshes`
growth item below; both are gameplay-behaviour changes, not bug fixes.

### Ledger correction — `requestPointerLock()` missing `.catch()`

The recon entry above recorded this as "INFERENCE ONLY — could NOT reproduce
headlessly; this Chromium build throws synchronously instead". **Partly
superseded:** a `window.addEventListener("unhandledrejection")` recorder DID fire
2-7 times per seed this run, which only fires for promise rejections — so
`document.body.requestPointerLock()` (`js/7DFPS-2014.js:46`) does return a
promise that rejects unhandled in this build.

**Read this carefully before acting on it.** The agent noted the unhandled-
rejection count *exactly matched* the pageerror count. That coincidence is not
explained, and a synchronous throw would surface as a pageerror, not an
unhandledrejection — so the two channels reporting identical counts leaves open
that one recorder is observing the other's event rather than a second, distinct
rejection. **Verify the two channels are independent before treating the missing
`.catch()` as confirmed.** The production-impact half (whether a *real* browser's
rapid re-lock rejection happens in practice) remains **INFERENCE** either way.

### Verified CLEAN this run

- **Assets:** all 6 referenced assets 200, exact case verified via
  `fs.realpathSync.native` against APFS canonical paths. Only `favicon.ico` 404s
  (browser-initiated, not referenced).
- **Boot:** start state `controls.enabled=false`, `triHexMeshes=1`, pos
  `[0,10,0]`, `scene.children=504`. Console noise is THREE r69 PlaneGeometry info
  + SwiftShader "GPU stall due to ReadPixels" — headless-only, not defects.
- **6-seed x 260-step fuzz** (real CDP keyboard/mouse: WASD/arrows/Space/Shift/
  Esc/Tab/F5/random keys, moves, clicks, drags, ESC-style pause/resume toggles):
  **zero NaN/Infinity** across `yawObject.position/rotation`, `camera.matrixWorld`,
  `camera.projectionMatrix`, `camera.aspect`, every `triHexMeshes[i].position/
  quaternion`, `heldMesh`, `meshHUD` position/scale, at every 25-step snapshot.
  No softlock (rAF advanced every interval, 991-1180 frames/run). Post-fix, max
  per-frame motion under ESC-toggle fuzz was **0.19-1.04 u** (vs a 50-u
  threshold). No unexpected navigations (F5 via CDP does not reload).
- **Resize storm** (2x10 alternations 375x812 <-> 1280x800, unlocked AND playing):
  **CLS = 0.0** (zero layout-shift entries), canvas tracks viewport exactly every
  step, `camera.aspect` finite and correct.
- **Overlay spam-click** (40 clicks + dblclick + drag): `triHexMeshes` stayed 1,
  `heldMesh.quaternion.w` stayed 1, `scene.children` stayed 504, and
  **addEventListener count stayed exactly 26 (growth 0)** — no listener leak. The
  input-gating and contextmenu fixes hold under spam.
- Game has no health/score variables — nothing to probe there (confirmed against
  source).

**Known follow-ups (not this run):**
- `triHexMeshes` unbounded growth — still open, measured in the entry above.
  Gameplay-design change; now has a natural companion (the per-frame shot speed
  above).
- Fog/clear colour mismatch — needs an art call from Emil, see above.
