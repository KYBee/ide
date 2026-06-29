import { useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const DEFAULT_LEFT_WIDTH = 286;
const DEFAULT_RIGHT_WIDTH = 316;
const MIN_LEFT_WIDTH = 220;
const MAX_LEFT_WIDTH = 480;
const MIN_RIGHT_WIDTH = 260;
const MAX_RIGHT_WIDTH = 560;
const MIN_WORKSPACE_WIDTH = 420;
export const RESIZE_HANDLE_WIDTH = 8;

function readStoredWidth(key: string, fallback: number): number {
  const stored = Number(window.localStorage.getItem(key));
  return Number.isFinite(stored) ? stored : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function usePanelWidths() {
  const [leftWidth, setLeftWidth] = useState(() => readStoredWidth("session-control:left-width", DEFAULT_LEFT_WIDTH));
  const [rightWidth, setRightWidth] = useState(() => readStoredWidth("session-control:right-width", DEFAULT_RIGHT_WIDTH));

  function maxLeftWidth(currentRightWidth = rightWidth): number {
    return Math.max(
      MIN_LEFT_WIDTH,
      window.innerWidth - currentRightWidth - MIN_WORKSPACE_WIDTH - RESIZE_HANDLE_WIDTH * 2
    );
  }

  function maxRightWidth(currentLeftWidth = leftWidth): number {
    return Math.max(
      MIN_RIGHT_WIDTH,
      window.innerWidth - currentLeftWidth - MIN_WORKSPACE_WIDTH - RESIZE_HANDLE_WIDTH * 2
    );
  }

  useEffect(() => {
    window.localStorage.setItem("session-control:left-width", String(Math.round(leftWidth)));
  }, [leftWidth]);

  useEffect(() => {
    window.localStorage.setItem("session-control:right-width", String(Math.round(rightWidth)));
  }, [rightWidth]);

  useEffect(() => {
    const handleWindowResize = () => {
      setLeftWidth((current) => clamp(current, MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, maxLeftWidth())));
      setRightWidth((current) => clamp(current, MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, maxRightWidth())));
    };
    handleWindowResize();
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [leftWidth, rightWidth]);

  function startResize(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startLeftWidth = leftWidth;
    const startRightWidth = rightWidth;
    document.body.classList.add("is-resizing-panels");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (side === "left") {
        setLeftWidth(clamp(startLeftWidth + delta, MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, maxLeftWidth(startRightWidth))));
        return;
      }
      setRightWidth(clamp(startRightWidth - delta, MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, maxRightWidth(startLeftWidth))));
    };

    const handlePointerUp = () => {
      document.body.classList.remove("is-resizing-panels");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function resetPanelWidths() {
    setLeftWidth(DEFAULT_LEFT_WIDTH);
    setRightWidth(DEFAULT_RIGHT_WIDTH);
  }

  return {
    gridTemplateColumns: `${leftWidth}px ${RESIZE_HANDLE_WIDTH}px minmax(${MIN_WORKSPACE_WIDTH}px, 1fr) ${RESIZE_HANDLE_WIDTH}px ${rightWidth}px`,
    resetPanelWidths,
    startResize
  };
}
