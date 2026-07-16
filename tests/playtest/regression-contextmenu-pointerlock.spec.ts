import { test, expect } from "@playwright/test";

// These globals are declared with `let`/`const` at the top level of a classic
// <script> (js/7DFPS-2014.js), so they live in the page's global lexical scope
// and are reachable by bare name inside page.evaluate(). Declared here only to
// satisfy TypeScript; they are never read in the Node/test context.
declare const controls: any;
declare const heldMesh: any;

// Regression: the right-click context menu must be suppressed WHILE PLAYING.
//
// Right-click (mouse button 2) is the "rotate the held piece" control — see the
// `mousedown` handler in js/7DFPS-2014.js. Before the fix there was no
// `contextmenu` listener at all, so every intended rotation ALSO popped the
// browser's default context menu. That menu steals focus and exits pointer
// lock, bouncing the player out of the game on every rotate — a real, repeating
// gameplay interruption (recon seed 2026071601 confirmed defaultPrevented was
// false during play).
//
// The fix adds a document `contextmenu` listener that calls preventDefault()
// but ONLY when `controls.enabled` (i.e. actively playing), mirroring the
// enabled-gate the mousedown handler already uses. It must NOT suppress the
// menu while unlocked (the "Click to play" overlay / normal browsing), so the
// guard cuts both ways — that is the second assertion below.
//
// Headless browsers cannot grant pointer lock, so `controls.enabled` stays
// false on its own; the tests drive it explicitly to exercise both states, the
// same technique the existing input-gating ledger entry used to verify the
// mousedown gate does not over-gate.
test.describe("2014-7DFPS right-click context menu gating", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForFunction(
      () =>
        typeof controls !== "undefined" && typeof heldMesh !== "undefined",
    );
  });

  test("right-click while playing suppresses the browser context menu", async ({
    page,
  }) => {
    const prevented = await page.evaluate(() => {
      controls.enabled = true;
      const ev = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(ev);
      controls.enabled = false; // restore the headless-idle state
      return ev.defaultPrevented;
    });
    // Pre-fix: no contextmenu handler → default NOT prevented → menu pops →
    // pointer lock lost. Post-fix: the enabled-gated handler prevents it.
    expect(prevented).toBe(true);
  });

  test("right-click while NOT playing leaves the browser menu available", async ({
    page,
  }) => {
    const prevented = await page.evaluate(() => {
      // controls.enabled is false here (headless idle / "Click to play" overlay).
      const ev = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    // The guard must not over-reach: while unlocked the normal context menu
    // must still be available (defaultPrevented stays false).
    expect(prevented).toBe(false);
  });

  test("rotate control still fires on right-click during play", async ({
    page,
  }) => {
    // Suppressing the context menu must not disturb the existing mousedown
    // rotate handler. Assert on quaternion.w (identity == 1); a single 60deg
    // rotateZ moves it off identity.
    const changed = await page.evaluate(() => {
      controls.enabled = true;
      const before = heldMesh.quaternion.w;
      document.dispatchEvent(
        new MouseEvent("mousedown", { button: 2, bubbles: true }),
      );
      const after = heldMesh.quaternion.w;
      controls.enabled = false;
      return before !== after;
    });
    expect(changed).toBe(true);
  });
});
