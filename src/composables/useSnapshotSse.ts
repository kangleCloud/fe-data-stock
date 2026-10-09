import { onBeforeUnmount, onMounted, shallowRef, ref } from "vue";

import { ApiError, requestStream, StreamResponseError } from "@/utils/request";
import { shareSnapshot } from "@/utils/snapshotSharing";
import { readEventStream } from "@/utils/sse";

const RETRY_DELAYS = [1_000, 2_000, 5_000, 10_000, 15_000];
const IDLE_TIMEOUT = 35_000;

interface SnapshotSseOptions<T> {
  path: string;
  label: string;
  get: () => Promise<unknown>;
  parse: (value: unknown) => T;
  id: (value: T) => string | null;
  apply: (current: T, patch: unknown) => T | "duplicate";
  readyKey: "snapshotId" | "stateId";
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function useSnapshotSse<T>(options: SnapshotSseOptions<T>) {
  const snapshot = shallowRef<T | null>(null);
  const loading = ref(false);
  const loadError = ref("");
  let mounted = false;
  let generation = 0;
  let controller: AbortController | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveDelay: (() => void) | null = null;
  let getTask: Promise<T> | null = null;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingError = "";
  let deniedGeneration: number | null = null;

  const denied = (error: unknown): boolean => error instanceof ApiError && (
    [401, 403].includes(error.code ?? 0) ||
    error instanceof StreamResponseError && [401, 403].includes(error.httpStatus)
  );

  const active = (current: number): boolean => mounted && generation === current && document.visibilityState === "visible";

  function clearRecovery(): void {
    if (recoveryTimer) clearTimeout(recoveryTimer);
    recoveryTimer = null;
    pendingError = "";
    loadError.value = "";
  }

  function reportError(current: number, message: string, error?: unknown): void {
    if (!active(current)) return;
    pendingError = message;
    if (!snapshot.value || error instanceof StreamResponseError || error instanceof ApiError && [401, 403].includes(error.code ?? 0)) {
      if (recoveryTimer) clearTimeout(recoveryTimer);
      recoveryTimer = null;
      loadError.value = message;
    } else if (loadError.value) loadError.value = message;
    else if (!recoveryTimer) recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      if (active(current)) loadError.value = pendingError;
    }, 10000);
  }

  function stop(): void {
    if (recoveryTimer) clearTimeout(recoveryTimer);
    recoveryTimer = null;
    generation += 1;
    controller?.abort();
    controller = null;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    resolveDelay?.();
    resolveDelay = null;
    loading.value = false;
  }

  async function align(current: number): Promise<boolean> {
    if (getTask) {
      try { await getTask; } catch { /* The next GET still runs. */ }
    }
    if (!active(current)) return false;
    loading.value = true;
    const task = options.get().then(options.parse);
    getTask = task;
    try {
      const next = await task;
      if (!active(current)) return false;
      snapshot.value = snapshot.value ? shareSnapshot(snapshot.value, next) : next;
      return true;
    } catch (error) {
      if (active(current) && denied(error)) deniedGeneration = current;
      reportError(current, error instanceof Error ? error.message : `${options.label}读取失败`, error);
      return false;
    } finally {
      if (getTask === task) getTask = null;
      if (active(current)) loading.value = false;
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

  async function lifecycle(current: number, first: Promise<boolean>): Promise<void> {
    let aligned = await first;
    let retries = 0;
    while (active(current) && deniedGeneration !== current) {
      if (!aligned) {
        await delay(RETRY_DELAYS[Math.min(retries++, RETRY_DELAYS.length - 1)]!);
        if (!active(current)) return;
        aligned = await align(current);
        continue;
      }
      const streamController = new AbortController();
      controller = streamController;
      let timedOut = false;
      const resetIdle = (): void => {
        if (!active(current)) return;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { timedOut = true; streamController.abort(); }, IDLE_TIMEOUT);
      };
      let ready = false;
      try {
        resetIdle();
        const response = await requestStream(options.path, streamController.signal, true);
        if (!active(current) || streamController.signal.aborted) {
          await response.body?.cancel();
          return;
        }
        await readEventStream(response, ({ event, data }) => {
          if (!active(current)) return;
          if (event === "resync") throw new Error(`${options.label}需要全量重同步`);
          if (event !== "ready" && event !== "patch") return;
          const payload: unknown = JSON.parse(data);
          if (!object(payload)) throw new Error(`${options.label}事件格式无效`);
          if (event === "ready") {
            if (ready || payload[options.readyKey] !== (snapshot.value && options.id(snapshot.value))) {
              throw new Error(`${options.label}版本不一致`);
            }
            ready = true;
            retries = 0;
            clearRecovery();
            return;
          }
          if (!ready || !snapshot.value) throw new Error(`${options.label}缺少就绪事件`);
          const next = options.apply(snapshot.value, payload);
          if (next !== "duplicate") {
            snapshot.value = shareSnapshot(snapshot.value, next);
            clearRecovery();
          }
        }, resetIdle);
        reportError(current, `${options.label}连接已结束，正在重同步`);
      } catch (error) {
        if (!active(current)) return;
        reportError(current, timedOut ? `${options.label}事件流超时，正在重同步` :
          error instanceof Error ? error.message : `${options.label}事件流中断`, error);
        if (denied(error)) return;
      } finally {
        streamController.abort();
        if (controller === streamController) {
          controller = null;
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = null;
        }
      }
      await delay(RETRY_DELAYS[Math.min(retries++, RETRY_DELAYS.length - 1)]!);
      if (!active(current)) return;
      aligned = await align(current);
    }
  }

  function start(): Promise<void> {
    stop();
    if (!mounted || document.visibilityState !== "visible") return Promise.resolve();
    const current = generation;
    const first = align(current);
    void lifecycle(current, first);
    return first.then(() => undefined);
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "visible") void start();
    else stop();
  }

  onMounted(() => {
    mounted = true;
    if (document.visibilityState === "visible") void start();
    document.addEventListener("visibilitychange", onVisibilityChange);
  });
  onBeforeUnmount(() => {
    mounted = false;
    stop();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });

  return { snapshot, loading, loadError, manualRefresh: start };
}
