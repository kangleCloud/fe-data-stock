import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from "vue";

const POLL_INTERVAL_MS = 10_000;

/** Keep-alive and background-tab guards for the configuration page and its map list. */
export function useRiskConfigPolling(tick: () => void, pause: () => void) {
  let active = true;
  let timer: number | undefined;
  const visible = () => active && document.visibilityState !== "hidden";
  function visibilityChanged() {
    if (!visible()) pause();
  }
  onMounted(() => {
    document.addEventListener("visibilitychange", visibilityChanged);
    timer = window.setInterval(() => {
      if (visible()) tick();
    }, POLL_INTERVAL_MS);
  });
  onActivated(() => { active = true; });
  onDeactivated(() => { active = false; pause(); });
  onBeforeUnmount(() => {
    active = false;
    document.removeEventListener("visibilitychange", visibilityChanged);
    window.clearInterval(timer);
  });
  return visible;
}
