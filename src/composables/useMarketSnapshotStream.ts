import { onBeforeUnmount, onMounted, ref } from "vue";

import { getMarketDashboardSnapshot } from "@/api/market";
import type { MarketDashboardSnapshot } from "@/types/market";
import { parseMarketSnapshot, readMarketStream } from "@/utils/marketStream";
import { ApiError, requestStream } from "@/utils/request";

const RETRY_DELAYS = [1_000, 2_000, 5_000, 10_000, 15_000];

export function useMarketSnapshotStream() {
  const snapshot = ref<MarketDashboardSnapshot | null>(null);
  const loading = ref(false);
  const loadError = ref("");
  let generation = 0;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveDelay: (() => void) | null = null;
  let mounted = false;

  function stop(): void {
    generation += 1;
    controller?.abort();
    controller = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    resolveDelay?.();
    resolveDelay = null;
    loading.value = false;
  }

  function terminal(error: unknown): boolean {
    if (error instanceof ApiError && error.code === 403) {
      loadError.value = "无权查看市场快照";
      return true;
    }
    return error instanceof ApiError && error.code === 401;
  }

  async function loadSnapshot(current: number): Promise<boolean> {
    if (loading.value) return true;
    loading.value = true;
    try {
      const next = parseMarketSnapshot(await getMarketDashboardSnapshot());
      if (current !== generation) return false;
      snapshot.value = next;
      loadError.value = "";
      return true;
    } catch (error) {
      if (current !== generation) return false;
      const isTerminal = terminal(error);
      if (!isTerminal) loadError.value = error instanceof Error ? error.message : "市场快照读取失败";
      return !isTerminal;
    } finally {
      if (current === generation) loading.value = false;
    }
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      resolveDelay = resolve;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        resolveDelay = null;
        resolve();
      }, ms);
    });
  }

  async function connect(current: number): Promise<void> {
    let retries = 0;
    if (!await loadSnapshot(current)) return;
    while (mounted && current === generation) {
      const activeController = new AbortController();
      controller = activeController;
      try {
        const response = await requestStream("/market/dashboard/stream", activeController.signal, true);
        retries = 0;
        await readMarketStream(response, (next) => {
          if (current !== generation) return;
          snapshot.value = next;
          loadError.value = "";
        }, (error) => {
          if (current === generation) loadError.value = error.message;
        });
      } catch (error) {
        if (current !== generation || activeController.signal.aborted) return;
        if (terminal(error)) return;
        loadError.value = error instanceof Error ? error.message : "市场流连接失败";
      } finally {
        if (controller === activeController) controller = null;
      }
      if (current !== generation) return;
      await delay(RETRY_DELAYS[Math.min(retries++, RETRY_DELAYS.length - 1)]!);
      if (current !== generation) return;
      if (!await loadSnapshot(current)) return;
    }
  }

  function start(): void {
    stop();
    if (!mounted) return;
    void connect(generation);
  }

  async function manualRefresh(): Promise<void> {
    await loadSnapshot(generation);
  }

  onMounted(() => {
    mounted = true;
    start();
  });
  onBeforeUnmount(() => {
    mounted = false;
    stop();
  });

  return { snapshot, loading, loadError, manualRefresh };
}
