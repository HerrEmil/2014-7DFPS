import { test, expect } from "@playwright/test";

// These globals are declared with `let`/`const` at the top level of a classic
// <script> (js/7DFPS-2014.js), so they live in the page's global lexical scope
// and are reachable by bare name inside page.evaluate(). Declared here only to
// satisfy TypeScript; they are never read in the Node/test context.
declare const controls: any;
declare const triHexMeshes: any;
declare const heldMesh: any;

// Regression: mouse input must be gated on play state.
//
// Before the fix, the document "mousedown" handler in js/7DFPS-2014.js fired
// shootTriHexMesh() (left button) and rotateTriHexMesh() (right button)
// unconditionally — even while the pointer was NOT locked
// (controls.enabled === false), i.e. while the "Click to play" blocker was still
// showing. Consequences:
//   * the very click that requests pointer lock ALSO spawned a piece,
//   * every click on the overlay mutated game state and grew `triHexMeshes`
//     without bound (the source even comments "This keeps getting longer").
//
// Headless browsers cannot grant pointer lock, so controls.enabled stays false —
// exactly the "not playing" state this test drives. PointerLockControls already
// gates its own mousemove/update with `if (scope.enabled === false) return;`;
// the fix applies the same guard to the mousedown handler.
test.describe("2014-7DFPS input gating", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    // Wait until init() has run and the game globals exist.
    await page.waitForFunction(
      () =>
        typeof controls !== "undefined" &&
        typeof triHexMeshes !== "undefined" &&
        typeof heldMesh !== "undefined",
    );
  });

  test("characterization: pointer starts unlocked in headless", async ({
    page,
  }) => {
    expect(await page.evaluate(() => controls.enabled)).toBe(false);
    // One held piece exists at startup, nothing spawned yet.
    expect(await page.evaluate(() => triHexMeshes.length)).toBe(1);
  });

  test("left-click while unlocked does not shoot or spawn pieces", async ({
    page,
  }) => {
    const before = await page.evaluate(() => triHexMeshes.length);
    await page.evaluate(() => {
      for (let i = 0; i < 12; i += 1) {
        document.dispatchEvent(
          new MouseEvent("mousedown", { button: 0, bubbles: true }),
        );
      }
    });
    // Pre-fix this grew by 12; post-fix it must be unchanged.
    expect(await page.evaluate(() => triHexMeshes.length)).toBe(before);
  });

  test("right-click while unlocked does not rotate the held piece", async ({
    page,
  }) => {
    // Assert on quaternion.w (identity == 1), not Euler.z: rotateZ multiplies the
    // quaternion, and a click count summing to a multiple of 360deg would wrap
    // back to identity and hide the bug. 5 * 60deg = 300deg avoids that.
    const before = await page.evaluate(() => heldMesh.quaternion.w);
    await page.evaluate(() => {
      for (let i = 0; i < 5; i += 1) {
        document.dispatchEvent(
          new MouseEvent("mousedown", { button: 2, bubbles: true }),
        );
      }
    });
    // Pre-fix this rotated by 5 * 60deg (quaternion.w -> cos(150deg) ~= -0.866);
    // post-fix it must be unchanged (still identity, w == 1).
    expect(await page.evaluate(() => heldMesh.quaternion.w)).toBeCloseTo(before, 10);
  });
});
