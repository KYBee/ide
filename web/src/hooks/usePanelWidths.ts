import { useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const DEFAULT_LEFT_WIDTH = 286;
const DEFAULT_RIGHT_WIDTH = 316;
const MIN_LEFT_WIDTH = 220;
const MIN_RIGHT_WIDTH = 260;
const MIN_WORKSPACE_WIDTH = 360;
export const RESIZE_HANDLE_WIDTH = 8;

export interface PanelWidths {
  left: number;
  right: number;
}

function readStoredWidth(key: string, fallback: number): number {
  const stored = Number(window.localStorage.getItem(key));
  return Number.isFinite(stored) ? stored : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function maxLeftWidth(viewportWidth: number, rightWidth: number): number {
  return Math.max(
    MIN_LEFT_WIDTH,
    viewportWidth - rightWidth - MIN_WORKSPACE_WIDTH - RESIZE_HANDLE_WIDTH * 2
  );
}

function maxRightWidth(viewportWidth: number, leftWidth: number): number {
  return Math.max(
    MIN_RIGHT_WIDTH,
    viewportWidth - leftWidth - MIN_WORKSPACE_WIDTH - RESIZE_HANDLE_WIDTH * 2
  );
}

export function clampPanelWidths(widths: PanelWidths, viewportWidth: number): PanelWidths {
  let left = Math.max(widths.left, MIN_LEFT_WIDTH);
  let right = Math.max(widths.right, MIN_RIGHT_WIDTH);
  const availableWidth = viewportWidth - MIN_WORKSPACE_WIDTH - RESIZE_HANDLE_WIDTH * 2;
  let excessWidth = left + right - availableWidth;

  if (excessWidth > 0) {
    const rightReduction = Math.min(excessWidth, right - MIN_RIGHT_WIDTH);
    right -= rightReduction;
    excessWidth -= rightReduction;
  }

  if (excessWidth > 0) {
    const leftReduction = Math.min(excessWidth, left - MIN_LEFT_WIDTH);
    left -= leftReduction;
  }

  return { left, right };
}

export function resizePanelWidths(
  side: "left" | "right",
  startWidths: PanelWidths,
  delta: number,
  viewportWidth: number
): PanelWidths {
  if (side === "left") {
    return {
      ...startWidths,
      left: clamp(
        startWidths.left + delta,
        MIN_LEFT_WIDTH,
        maxLeftWidth(viewportWidth, startWidths.right)
      )
    };
  }

  return {
    ...startWidths,
    right: clamp(
      startWidths.right - delta,
      MIN_RIGHT_WIDTH,
      maxRightWidth(viewportWidth, startWidths.left)
    )
  };
}

export function panelGridTemplateColumns(widths: PanelWidths): string {
  return `${widths.left}px ${RESIZE_HANDLE_WIDTH}px minmax(${MIN_WORKSPACE_WIDTH}px, 1fr) ${RESIZE_HANDLE_WIDTH}px ${widths.right}px`;
}

export function usePanelWidths() {
  const [widths, setWidths] = useState<PanelWidths>(() => clampPanelWidths({
    left: readStoredWidth("session-control:left-width", DEFAULT_LEFT_WIDTH),
    right: readStoredWidth("session-control:right-width", DEFAULT_RIGHT_WIDTH)
  }, window.innerWidth));

  useEffect(() => {
    window.localStorage.setItem("session-control:left-width", String(Math.round(widths.left)));
  }, [widths.left]);

  useEffect(() => {
    window.localStorage.setItem("session-control:right-width", String(Math.round(widths.right)));
  }, [widths.right]);

  useEffect(() => {
    const handleWindowResize = () => {
      setWidths((current) => clampPanelWidths(current, window.innerWidth));
    };
    handleWindowResize();
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  function startResize(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidths = widths;
    document.body.classList.add("is-resizing-panels");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setWidths(resizePanelWidths(side, startWidths, delta, window.innerWidth));
    };

    const handlePointerUp = () => {
      document.body.classList.remove("is-resizing-panels");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerUp, { once: true });
  }

  function resetPanelWidths() {
    setWidths(clampPanelWidths({
      left: DEFAULT_LEFT_WIDTH,
      right: DEFAULT_RIGHT_WIDTH
    }, window.innerWidth));
  }

  return {
    gridTemplateColumns: panelGridTemplateColumns(widths),
    resetPanelWidths,
    startResize
  };
}
