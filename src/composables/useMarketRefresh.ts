import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";

import * as marketApi from "@/api/market";
import { useMarketStore } from "@/stores/market";
import { secondsUntil } from "@/utils/market";

const POLL_INTERVAL = 1_000;
const FALLBACK_REFRESH_SECONDS = 40;

export function useMarketRefresh() {
  const marketStore = useMarketStore();
  const countdown = ref(0);
  const visible = ref(
    typeof document === "undefined" || document.visibilityState === "visible",
  );
  let timer: ReturnType<typeof setInterval> | undefined;
  let activeTask: Promise<void> | null = null;

  const countdownLabel = computed(() =>
    marketStore.refreshing ? "刷新中" : `${countdown.value}s`,
  );

  function resetCountdown(): void {
    countdown.value =
      secondsUntil(marketStore.status?.nextRefreshAt) ||
      FALLBACK_REFRESH_SECONDS;
  }

  async function runRefresh(manual = false): Promise<void> {
    if (activeTask) {
      return activeTask;
    }
    activeTask = (async () => {
      marketStore.refreshing = true;
      const previousBatch = marketStore.status?.refreshBatchId;
      try {
        if (manual) {
          await marketApi.refreshDashboard();
        }
        let attempts = manual ? 15 : 1;
        do {
          const status = await marketStore.loadStatus();
          if (!manual || status.refreshBatchId !== previousBatch) {
            break;
          }
          attempts -= 1;
          if (attempts > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 1_000));
          }
        } while (attempts > 0);
        marketStore.announceRefresh();
        resetCountdown();
      } catch (error) {
        marketStore.statusError =
          error instanceof Error ? error.message : "行情刷新失败";
        countdown.value = FALLBACK_REFRESH_SECONDS;
      } finally {
        marketStore.refreshing = false;
        activeTask = null;
      }
    })();
    return activeTask;
  }

  function tick(): void {
    if (!visible.value || marketStore.refreshing) {
      return;
    }
    if (countdown.value > 0) {
      countdown.value -= 1;
      return;
    }
    void runRefresh();
  }

  async function initialize(): Promise<void> {
    try {
      await marketStore.loadStatus();
      resetCountdown();
    } catch {
      countdown.value = FALLBACK_REFRESH_SECONDS;
    }
    marketStore.announceRefresh();
  }

  function onVisibilityChange(): void {
    visible.value = document.visibilityState === "visible";
    if (visible.value) {
      void runRefresh();
    }
  }

  onMounted(() => {
    void initialize();
    timer = setInterval(tick, POLL_INTERVAL);
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  onBeforeUnmount(() => {
    if (timer) {
      clearInterval(timer);
    }
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });

  return {
    countdown,
    countdownLabel,
    manualRefresh: () => runRefresh(true),
    refreshing: computed(() => marketStore.refreshing),
  };
}
