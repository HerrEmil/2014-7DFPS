import { test, expect } from "@playwright/test";

// `controls` is declared at the top level of a classic <script>
// (js/7DFPS-2014.js), so it lives in the page's global lexical scope and is
// reachable by bare name inside page.evaluate(). Declared here only to satisfy
// TypeScript; it is never read in the Node/test context.
declare const controls: any;

// Regression: pausing must not fling the player across the world.
//
// js/PointerLockControls.js update() early-returns while `enabled === false`,
// which used to skip the `prevTime = time` assignment at the bottom of the
// function. `prevTime` therefore froze for the entire time the pointer was
// unlocked, and the first frame after re-locking computed
// `delta = (now - prevTime) / 1000` = the whole pause duration. That single
// oversized delta does two things at once:
//
//   * `velocity.x -= velocity.x * 10.0 * delta` — for any delta > 0.1s the
//     factor (1 - 10*delta) goes NEGATIVE, so velocity is inverted and
//     amplified rather than damped. A 3s pause is a -29x multiplier.
//   * `if (moveForward) velocity.z -= 400.0 * delta` — onKeyDown has no
//     `enabled` gate, so a key held while unlocked applies a full
//     pause-length impulse.
//
// Displacement scales with delta^2, so a 3s pause moved the player ~3900 units
// in one frame (a normal frame moves ~0.336). Nothing goes NaN — the values
// stay finite, which is why this hid for so long — but THREE.Fog is opaque
// white past 750 units (js/7DFPS-2014.js:126) and the floor is only 200x200,
// so the player lands in a featureless void with no landmark to navigate back
// by. That makes it softlock-grade, triggered by the most ordinary pointer-lock
// interaction there is: press ESC, come back.
//
// Note the Y-only floor clamp (PointerLockControls.js:172-179) does NOT save
// this: X and Z are unclamped. With velocity at zero the X/Z terms contribute
// nothing and the Y blowup IS caught, which is why the idle case below looks
// clean. Earlier runs tested only that idle case and wrongly concluded the
// stale delta was self-correcting. Both tests here are load-bearing: the first
// proves the bug is fixed, the second proves the guard is not over-broad.
test.describe("2014-7DFPS pause teleport", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForFunction(() => typeof controls !== "undefined");
  });

  // Resolves once `n` animation frames have been served. The game's own
  // animate() loop (js/7DFPS-2014.js:217) drives controls.update() on rAF, so
  // awaiting rAF callbacks advances real game frames.
  const stepFrames = (page: any, n: number) =>
    page.evaluate(
      (count: number) =>
        new Promise<void>((resolve) => {
          let seen = 0;
          const tick = () => {
            seen += 1;
            if (seen >= count) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      n,
    );

  test("resuming after a pause does not teleport a moving player", async ({
    page,
  }) => {
    // Play forward for ~30 frames so velocity.z is non-zero, then release the
    // key. The bug needs no latched key — the damping inversion alone does it.
    await page.evaluate(() => {
      controls.enabled = true;
      document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 87 } as any));
    });
    await stepFrames(page, 30);
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keyup", { keyCode: 87 } as any));
    });

    // What pressing ESC does: pointerlockchange sets controls.enabled = false.
    const paused = await page.evaluate(() => {
      controls.enabled = false;
      const p = controls.getObject().position;
      return { x: p.x, z: p.z };
    });

    // Guard against a vacuous pass: if movement were broken outright the player
    // would sit at the origin and the displacement assertion below would be
    // trivially satisfied. Walking forward for 30 frames must actually travel.
    expect(Math.hypot(paused.x, paused.z)).toBeGreaterThan(1);

    // A real wall-clock pause is required — the stale delta IS the elapsed
    // time, so this is deterministic without any seed.
    await page.waitForTimeout(2500);

    await page.evaluate(() => {
      controls.enabled = true;
    });
    await stepFrames(page, 2);

    const resumed = await page.evaluate(() => {
      const p = controls.getObject().position;
      return { x: p.x, z: p.z };
    });

    const displacement = Math.hypot(resumed.x - paused.x, resumed.z - paused.z);

    // Pre-fix this measured ~2200-2500 units in a single frame at this 2.5s
    // pause, sign-flipped, against a normal frame of ~0.336 units. Post-fix the
    // player keeps its momentum and coasts well under a unit. 5 units is a
    // generous ceiling that still leaves ~3 orders of magnitude of margin.
    expect(displacement).toBeLessThan(5);
    expect(Number.isFinite(displacement)).toBe(true);
  });

  test("a key held down during the pause does not launch the player on resume", async ({
    page,
  }) => {
    // The other trigger. Here velocity starts at ZERO, so the damping-inversion
    // term contributes nothing; this isolates the impulse term instead.
    // onKeyDown (PointerLockControls.js:46) has no `enabled` gate, so W latches
    // moveForward = true while the "Click to play" overlay is still up. Pre-fix,
    // the first frame after locking then applied `velocity.z -= 400.0 * delta`
    // with delta = the whole pause.
    const paused = await page.evaluate(() => {
      controls.enabled = false;
      document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 87 } as any));
      const p = controls.getObject().position;
      return { x: p.x, z: p.z };
    });

    await page.waitForTimeout(2500);

    await page.evaluate(() => {
      controls.enabled = true;
    });
    await stepFrames(page, 2);

    const resumed = await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keyup", { keyCode: 87 } as any));
      const p = controls.getObject().position;
      return { x: p.x, z: p.z };
    });

    const displacement = Math.hypot(resumed.x - paused.x, resumed.z - paused.z);

    // Pre-fix: ~2500 units on the first frame. Post-fix the held key just
    // starts normal forward walking, a fraction of a unit per frame.
    expect(displacement).toBeLessThan(5);
  });

  test("control case: an idle pause leaves a still player exactly where it was", async ({
    page,
  }) => {
    // No key is ever pressed, so velocity stays zero. This case was ALWAYS
    // clean, even pre-fix — it is here to prove the prevTime guard does not
    // over-correct and start nudging a stationary player.
    const paused = await page.evaluate(() => {
      controls.enabled = false;
      const p = controls.getObject().position;
      return { x: p.x, y: p.y, z: p.z };
    });

    await page.waitForTimeout(2500);

    await page.evaluate(() => {
      controls.enabled = true;
    });
    await stepFrames(page, 2);

    const resumed = await page.evaluate(() => {
      const p = controls.getObject().position;
      return { x: p.x, y: p.y, z: p.z };
    });

    expect(resumed.x).toBeCloseTo(paused.x, 6);
    expect(resumed.z).toBeCloseTo(paused.z, 6);
    // y is held at the floor by the clamp at PointerLockControls.js:172-179.
    expect(resumed.y).toBeCloseTo(10, 6);
  });
});
