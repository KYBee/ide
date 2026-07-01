import test from "node:test";
import assert from "node:assert/strict";
import { clampPanelWidths, panelGridTemplateColumns, resizePanelWidths } from "../web/src/hooks/usePanelWidths";

test("panel widths preserve workspace room while clamping oversized sidebars", () => {
  assert.deepEqual(
    clampPanelWidths({ left: 900, right: 900 }, 1360),
    { left: 724, right: 260 }
  );
});

test("panel widths keep both sidebars usable on narrow windows", () => {
  assert.deepEqual(
    clampPanelWidths({ left: 480, right: 560 }, 900),
    { left: 264, right: 260 }
  );
});

test("left resize keeps the right panel fixed while preserving workspace room", () => {
  assert.deepEqual(
    resizePanelWidths("left", { left: 286, right: 316 }, 500, 1200),
    { left: 508, right: 316 }
  );
});

test("right resize keeps the left panel fixed while preserving workspace room", () => {
  assert.deepEqual(
    resizePanelWidths("right", { left: 286, right: 316 }, -500, 1200),
    { left: 286, right: 538 }
  );
});

test("panel grid template reflects stable dimensions", () => {
  assert.equal(
    panelGridTemplateColumns({ left: 286, right: 316 }),
    "286px 8px minmax(360px, 1fr) 8px 316px"
  );
});
