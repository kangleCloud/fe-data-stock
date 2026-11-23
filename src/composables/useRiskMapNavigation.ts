import { useEventListener } from "@vueuse/core";
import type { Ref } from "vue";

export const RISK_MAP_ZOOM_STEP = 1.4;
type Point = [number, number];

export function riskMapCameraPixel(center: Point, anchor: Point, shift: Point, scale: number): Point {
  return [
    anchor[0] + (center[0] - anchor[0] - shift[0]) / scale,
    anchor[1] + (center[1] - anchor[1] - shift[1]) / scale,
  ];
}

export function useRiskMapNavigation(
  surface: Ref<HTMLElement | undefined>,
  viewport: Ref<HTMLElement | undefined>,
  move: (scale: number, shift: Point, anchor?: Point) => void,
  reset: () => void,
) {
  let mouse: { id: number; point: Point; dragged: boolean } | undefined;
  let pinch: { point: Point; distance: number } | undefined;
  let suppressClickUntil = 0;
  const desktop = matchMedia("(min-width: 1440px) and (min-height: 800px)");
  const inside = ([x, y]: Point) => {
    const box = viewport.value?.getBoundingClientRect();
    return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  };

  useEventListener(surface, "pointerdown", (event: PointerEvent) => {
    const point: Point = [event.clientX, event.clientY];
    if (!inside(point)) return;
    suppressClickUntil = 0;
    if (event.pointerType !== "touch" && event.button === 0) mouse = { id: event.pointerId, point, dragged: false };
  }, { capture: true });
  useEventListener(window, "pointermove", (event: PointerEvent) => {
    if (!mouse || mouse.id !== event.pointerId) return;
    const shift: Point = [event.clientX - mouse.point[0], event.clientY - mouse.point[1]];
    if (!mouse.dragged && Math.hypot(...shift) < 5) return;
    mouse.point = [event.clientX, event.clientY];
    mouse.dragged = true;
    move(1, shift);
  });
  function release(event: PointerEvent) {
    if (!mouse || mouse.id !== event.pointerId) return;
    if (mouse.dragged) suppressClickUntil = performance.now() + 500;
    mouse = undefined;
  }
  useEventListener(window, "pointerup", release, { capture: true });
  useEventListener(window, "pointercancel", release, { capture: true });
  useEventListener(window, "blur", () => { mouse = undefined; pinch = undefined; });
  useEventListener(surface, "wheel", (event: WheelEvent) => {
    const point: Point = [event.clientX, event.clientY];
    if (!inside(point) || (!desktop.matches && !event.ctrlKey && !event.metaKey) || !event.deltaY) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
    move(Math.exp(-Math.max(-150, Math.min(150, pixels)) / 280), [0, 0], point);
  }, { capture: true, passive: false });

  function gesture(event: TouchEvent) {
    if (event.touches.length !== 2) {
      pinch = undefined;
      return;
    }
    const [a, b] = [event.touches[0]!, event.touches[1]!];
    if (!pinch && (!inside([a.clientX, a.clientY]) || !inside([b.clientX, b.clientY]))) return;
    if (event.cancelable) event.preventDefault();
    const point: Point = [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2];
    const distance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
    suppressClickUntil = performance.now() + 500;
    if (pinch) move(distance / pinch.distance, [point[0] - pinch.point[0], point[1] - pinch.point[1]], pinch.point);
    pinch = { point, distance };
  }
  useEventListener(surface, ["touchstart", "touchmove", "touchend", "touchcancel"], gesture, { capture: true, passive: false });

  function skipClick() { return !!mouse?.dragged || performance.now() < suppressClickUntil; }
  useEventListener(surface, "click", (event: MouseEvent) => {
    if (skipClick() || !inside([event.clientX, event.clientY])) event.stopImmediatePropagation();
  }, { capture: true });

  function keydown(event: KeyboardEvent) {
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key) {
      case "ArrowLeft": move(1, [48, 0]); break;
      case "ArrowRight": move(1, [-48, 0]); break;
      case "ArrowUp": move(1, [0, 48]); break;
      case "ArrowDown": move(1, [0, -48]); break;
      case "+": case "=": move(RISK_MAP_ZOOM_STEP, [0, 0]); break;
      case "-": move(1 / RISK_MAP_ZOOM_STEP, [0, 0]); break;
      case "0": reset(); break;
      default: return;
    }
    event.preventDefault();
  }
  return { keydown, skipClick };
}
